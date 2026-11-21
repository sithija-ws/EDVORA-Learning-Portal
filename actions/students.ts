// actions/students.ts
// Server Actions for student management (Teacher only).
// Privileged operations utilize createServerAdminClient() on the server.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerAdminClient } from "@/lib/supabase/server";
import { createStudentSchema, updateStudentSchema } from "@/lib/validators/student";
import { STUDENT_EMAIL_DOMAIN, ROLES } from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates a student account (auth user + profile + batch enrollments).
 */
export async function createStudent(
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  const rawFullName = formData.get("full_name");
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");
  const rawPhone = formData.get("phone");
  const rawBatchIds = formData.getAll("batch_ids");

  const parseResult = createStudentSchema.safeParse({
    full_name: typeof rawFullName === "string" ? rawFullName : "",
    username: typeof rawUsername === "string" ? rawUsername : "",
    password: typeof rawPassword === "string" ? rawPassword : "",
    phone: typeof rawPhone === "string" && rawPhone.trim() !== "" ? rawPhone : undefined,
    batch_ids: rawBatchIds.filter((id): id is string => typeof id === "string" && id.trim() !== ""),
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid student data",
    };
  }

  const { full_name, username, password, phone, batch_ids } = parseResult.data;
  const email = `${username.toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
  const adminClient = createServerAdminClient();

  // 1. Create auth.users record via Admin API
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
      username,
    },
  });

  if (authError || !authData.user) {
    const errorMsg =
      authError?.message?.toLowerCase().includes("already registered") ||
      authError?.message?.toLowerCase().includes("email exists")
        ? "A student with this username already exists"
        : authError?.message ?? "Failed to create user account";
    return {
      success: false,
      data: null,
      error: errorMsg,
    };
  }

  const newUserId = authData.user.id;

  // 2. Insert into public.profiles
  const { error: profileError } = await adminClient.from("profiles").insert({
    id: newUserId,
    full_name,
    role: ROLES.STUDENT,
    is_active: true,
    phone: phone || null,
  });

  if (profileError) {
    // Rollback auth user creation
    await adminClient.auth.admin.deleteUser(newUserId);
    return {
      success: false,
      data: null,
      error: `Failed to create profile: ${profileError.message}`,
    };
  }

  // 3. Insert into public.enrollments
  const enrollmentRows = batch_ids.map((bId) => ({
    student_id: newUserId,
    batch_id: bId,
  }));

  const { error: enrollError } = await adminClient.from("enrollments").insert(enrollmentRows);

  if (enrollError) {
    // Rollback profile and auth user
    await adminClient.from("profiles").delete().eq("id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
    return {
      success: false,
      data: null,
      error: `Failed to enroll student: ${enrollError.message}`,
    };
  }

  // Revalidate cache for affected batches
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");
  batch_ids.forEach((id) => revalidatePath(`/dashboard/batches/${id}`));

  const primaryBatchId = batch_ids[0];
  redirect(`/dashboard/batches/${primaryBatchId}`);
}

/**
 * Updates a student profile and batch enrollments.
 */
export async function updateStudent(
  studentId: string,
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  const rawFullName = formData.get("full_name");
  const rawPhone = formData.get("phone");
  const rawIsActive = formData.get("is_active");
  const rawBatchIds = formData.getAll("batch_ids");

  const parseResult = updateStudentSchema.safeParse({
    full_name: typeof rawFullName === "string" && rawFullName.trim() !== "" ? rawFullName : undefined,
    phone: typeof rawPhone === "string" ? rawPhone : undefined,
    is_active: rawIsActive !== null ? rawIsActive === "true" || rawIsActive === "on" : undefined,
    batch_ids:
      rawBatchIds.length > 0
        ? rawBatchIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
        : undefined,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid update data",
    };
  }

  const adminClient = createServerAdminClient();
  const profileUpdates: Database["public"]["Tables"]["profiles"]["Update"] = {};

  if (parseResult.data.full_name !== undefined) profileUpdates.full_name = parseResult.data.full_name;
  if (parseResult.data.phone !== undefined) profileUpdates.phone = parseResult.data.phone || null;
  if (parseResult.data.is_active !== undefined) profileUpdates.is_active = parseResult.data.is_active;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profileUpdates)
      .eq("id", studentId);

    if (profileError) {
      return {
        success: false,
        data: null,
        error: profileError.message,
      };
    }
  }

  // Synchronize batch enrollments if provided
  if (parseResult.data.batch_ids !== undefined) {
    const desiredBatchIds = new Set(parseResult.data.batch_ids);

    const { data: currentEnrollments, error: fetchError } = await adminClient
      .from("enrollments")
      .select("batch_id")
      .eq("student_id", studentId);

    if (fetchError) {
      return {
        success: false,
        data: null,
        error: fetchError.message,
      };
    }

    const currentBatchIds = new Set(currentEnrollments.map((e) => e.batch_id));

    // Determine additions and removals
    const toAdd = [...desiredBatchIds].filter((id) => !currentBatchIds.has(id));
    const toRemove = [...currentBatchIds].filter((id) => !desiredBatchIds.has(id));

    if (toRemove.length > 0) {
      const { error: removeError } = await adminClient
        .from("enrollments")
        .delete()
        .eq("student_id", studentId)
        .in("batch_id", toRemove);

      if (removeError) {
        return {
          success: false,
          data: null,
          error: removeError.message,
        };
      }
    }

    if (toAdd.length > 0) {
      const insertRows = toAdd.map((batch_id) => ({
        student_id: studentId,
        batch_id,
      }));

      const { error: addError } = await adminClient.from("enrollments").insert(insertRows);

      if (addError) {
        return {
          success: false,
          data: null,
          error: addError.message,
        };
      }
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}

/**
 * Toggles a student's active status (deactivate or reactivate).
 */
export async function toggleStudentActive(
  studentId: string,
  currentStatus: boolean,
  batchId?: string
): Promise<ActionResult<void>> {
  const adminClient = createServerAdminClient();

  const { error } = await adminClient
    .from("profiles")
    .update({ is_active: !currentStatus })
    .eq("id", studentId);

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");
  if (batchId) {
    revalidatePath(`/dashboard/batches/${batchId}`);
  }

  return {
    success: true,
    data: undefined,
    error: null,
  };
}

/**
 * Unenrolls a student from a specific batch.
 */
export async function unenrollStudentFromBatch(
  studentId: string,
  batchId: string
): Promise<ActionResult<void>> {
  const adminClient = createServerAdminClient();

  const { error } = await adminClient
    .from("enrollments")
    .delete()
    .eq("student_id", studentId)
    .eq("batch_id", batchId);

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");
  revalidatePath(`/dashboard/batches/${batchId}`);

  return {
    success: true,
    data: undefined,
    error: null,
  };
}
