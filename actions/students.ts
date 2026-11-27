// actions/students.ts
// Server Actions for student management (Staff only).
// Fully migrated to tenant-aware authorization, explicit permissions, and tenant isolation.
// Privileged auth user provisioning strictly guarded by explicit permission verification.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient, createServerAdminClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/auth/tenant";
import { createStudentSchema, updateStudentSchema } from "@/lib/validators/student";
import { STUDENT_EMAIL_DOMAIN, ROLES } from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates a student account (auth user + profile + student_identities + batch enrollments).
 * Strictly requires students:create_enroll permission and enforces tenant scoping.
 */
export async function createStudent(
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("students:create_enroll");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

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
  const cleanUsername = username.trim().toLowerCase();
  const supabase = await createServerClient();

  // 1. Validate that all batches belong to the caller's tenant
  const { data: validBatches, error: batchCheckError } = await supabase
    .from("batches")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .in("id", batch_ids);

  if (batchCheckError || !validBatches || validBatches.length !== batch_ids.length) {
    return {
      success: false,
      data: null,
      error: "One or more selected batches do not exist or belong to another workspace",
    };
  }

  // 2. Validate tenant-scoped username uniqueness in student_identities
  const { data: existingIdentity, error: identityCheckError } = await supabase
    .from("student_identities")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .ilike("username", cleanUsername)
    .maybeSingle();

  if (identityCheckError && identityCheckError.code !== "PGRST116") {
    return {
      success: false,
      data: null,
      error: `Failed to verify username availability: ${identityCheckError.message}`,
    };
  }

  if (existingIdentity) {
    return {
      success: false,
      data: null,
      error: "A student with this username already exists in this workspace",
    };
  }

  // 3. Provision auth user with tenant-isolated synthetic email
  const syntheticEmail = `std_${crypto.randomUUID().replace(/-/g, "")}@${STUDENT_EMAIL_DOMAIN}`;
  const adminClient = createServerAdminClient();

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
      username: cleanUsername,
      tenant_id: tenant.tenantId,
    },
  });

  if (authError || !authData.user) {
    return {
      success: false,
      data: null,
      error: authError?.message ?? "Failed to create user account",
    };
  }

  const newUserId = authData.user.id;

  // 4. Insert public.profiles record
  const { error: profileError } = await adminClient.from("profiles").insert({
    id: newUserId,
    full_name,
    role: ROLES.STUDENT,
    is_active: true,
    phone: phone || null,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUserId);
    return {
      success: false,
      data: null,
      error: `Failed to create profile: ${profileError.message}`,
    };
  }

  // 5. Insert public.student_identities mapping record
  const { error: mapError } = await adminClient.from("student_identities").insert({
    tenant_id: tenant.tenantId,
    student_id: newUserId,
    username: cleanUsername,
    auth_email: syntheticEmail,
  });

  if (mapError) {
    await adminClient.from("profiles").delete().eq("id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
    return {
      success: false,
      data: null,
      error: `Failed to record student identity: ${mapError.message}`,
    };
  }

  // 6. Insert public.enrollments records scoped to this tenant
  const enrollmentRows = batch_ids.map((bId) => ({
    tenant_id: tenant.tenantId,
    student_id: newUserId,
    batch_id: bId,
  }));

  const { error: enrollError } = await adminClient.from("enrollments").insert(enrollmentRows);

  if (enrollError) {
    await adminClient
      .from("student_identities")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("student_id", newUserId);
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
 * Verifies student belongs to the caller's tenant.
 */
export async function updateStudent(
  studentId: string,
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("students:edit_status");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

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

  const supabase = await createServerClient();

  // Verify target student belongs to caller's tenant
  const { data: studentIdentity, error: identityError } = await supabase
    .from("student_identities")
    .select("id, student_id")
    .eq("tenant_id", tenant.tenantId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (identityError || !studentIdentity) {
    return {
      success: false,
      data: null,
      error: "Student not found or does not belong to this workspace",
    };
  }

  // Validate target batches if provided
  if (parseResult.data.batch_ids && parseResult.data.batch_ids.length > 0) {
    const { data: validBatches, error: batchCheckError } = await supabase
      .from("batches")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .in("id", parseResult.data.batch_ids);

    if (batchCheckError || !validBatches || validBatches.length !== parseResult.data.batch_ids.length) {
      return {
        success: false,
        data: null,
        error: "One or more selected batches do not exist or belong to another workspace",
      };
    }
  }

  const profileUpdates: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (parseResult.data.full_name !== undefined) profileUpdates.full_name = parseResult.data.full_name;
  if (parseResult.data.phone !== undefined) profileUpdates.phone = parseResult.data.phone || null;
  if (parseResult.data.is_active !== undefined) profileUpdates.is_active = parseResult.data.is_active;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
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

  // Synchronize batch enrollments within this tenant
  if (parseResult.data.batch_ids !== undefined) {
    const desiredBatchIds = new Set(parseResult.data.batch_ids);

    const { data: currentEnrollments, error: fetchError } = await supabase
      .from("enrollments")
      .select("batch_id")
      .eq("student_id", studentId)
      .eq("tenant_id", tenant.tenantId);

    if (fetchError) {
      return {
        success: false,
        data: null,
        error: fetchError.message,
      };
    }

    const currentBatchIds = new Set((currentEnrollments ?? []).map((e) => e.batch_id));

    const toAdd = [...desiredBatchIds].filter((id) => !currentBatchIds.has(id));
    const toRemove = [...currentBatchIds].filter((id) => !desiredBatchIds.has(id));

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from("enrollments")
        .delete()
        .eq("student_id", studentId)
        .eq("tenant_id", tenant.tenantId)
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
        tenant_id: tenant.tenantId,
        student_id: studentId,
        batch_id,
      }));

      const { error: addError } = await supabase.from("enrollments").insert(insertRows);

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
 * Verifies student belongs to the caller's tenant.
 */
export async function toggleStudentActive(
  studentId: string,
  currentStatus: boolean,
  batchId?: string
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("students:edit_status");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const supabase = await createServerClient();

  // Verify student belongs to caller's tenant
  const { data: studentIdentity, error: identityError } = await supabase
    .from("student_identities")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (identityError || !studentIdentity) {
    return {
      success: false,
      data: null,
      error: "Student not found or does not belong to this workspace",
    };
  }

  const { error } = await supabase
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
 * Verifies both batch and enrollment belong to the caller's tenant.
 */
export async function unenrollStudentFromBatch(
  studentId: string,
  batchId: string
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("students:edit_status");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const supabase = await createServerClient();

  // Verify batch belongs to caller's tenant
  const { data: batchData, error: batchError } = await supabase
    .from("batches")
    .select("id")
    .eq("id", batchId)
    .eq("tenant_id", tenant.tenantId)
    .maybeSingle();

  if (batchError || !batchData) {
    return {
      success: false,
      data: null,
      error: "Batch not found or does not belong to this workspace",
    };
  }

  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("student_id", studentId)
    .eq("batch_id", batchId)
    .eq("tenant_id", tenant.tenantId);

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

/**
 * Deletes a student from the workspace.
 * Requires students:delete permission and verifies tenant membership.
 */
export async function deleteStudent(studentId: string): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("students:delete");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const supabase = await createServerClient();

  // Verify student belongs to caller's tenant
  const { data: studentIdentity, error: identityError } = await supabase
    .from("student_identities")
    .select("id, auth_email")
    .eq("tenant_id", tenant.tenantId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (identityError || !studentIdentity) {
    return {
      success: false,
      data: null,
      error: "Student not found or does not belong to this workspace",
    };
  }

  const adminClient = createServerAdminClient();

  // 1. Delete student enrollments in this tenant
  await adminClient
    .from("enrollments")
    .delete()
    .eq("tenant_id", tenant.tenantId)
    .eq("student_id", studentId);

  // 2. Delete tenant student identity
  await adminClient
    .from("student_identities")
    .delete()
    .eq("tenant_id", tenant.tenantId)
    .eq("student_id", studentId);

  // 3. Check if student has identities in any other tenant
  const { data: otherIdentities } = await adminClient
    .from("student_identities")
    .select("id")
    .eq("student_id", studentId);

  if (!otherIdentities || otherIdentities.length === 0) {
    // Student belongs solely to this tenant; purge profile and auth user
    await adminClient.from("profiles").delete().eq("id", studentId);
    await adminClient.auth.admin.deleteUser(studentId);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}
