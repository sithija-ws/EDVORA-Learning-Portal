// actions/batches.ts
// Server Actions for batch management with strict multi-tenant isolation.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/auth/tenant";
import { createBatchSchema, updateBatchSchema } from "@/lib/validators/batch";
import type { ActionResult, Batch } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates a new tuition batch within the caller's active tenant workspace.
 */
export async function createBatch(
  _prevState: ActionResult<Batch> | null,
  formData: FormData
): Promise<ActionResult<Batch>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("batches:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const rawName = formData.get("name");
  const rawYear = formData.get("year");
  const rawDesc = formData.get("description");

  const parseResult = createBatchSchema.safeParse({
    name: typeof rawName === "string" ? rawName : "",
    year: rawYear ? Number(rawYear) : NaN,
    description: typeof rawDesc === "string" && rawDesc.trim() !== "" ? rawDesc : undefined,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid batch data",
    };
  }

  const { name, year, description } = parseResult.data;
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("batches")
    .insert({
      tenant_id: tenant.tenantId,
      name,
      year,
      description: description ?? null,
      is_archived: false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        data: null,
        error: "A batch with this name already exists in your workspace",
      };
    }
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");
  redirect(`/dashboard/batches/${data.id}`);
}

/**
 * Updates an existing batch strictly scoped to the caller's active tenant.
 */
export async function updateBatch(
  batchId: string,
  _prevState: ActionResult<Batch> | null,
  formData: FormData
): Promise<ActionResult<Batch>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("batches:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const rawName = formData.get("name");
  const rawYear = formData.get("year");
  const rawDesc = formData.get("description");
  const rawArchived = formData.get("is_archived");

  const parseResult = updateBatchSchema.safeParse({
    name: typeof rawName === "string" && rawName.trim() !== "" ? rawName : undefined,
    year: rawYear ? Number(rawYear) : undefined,
    description: typeof rawDesc === "string" ? rawDesc : undefined,
    is_archived: rawArchived !== null ? rawArchived === "true" || rawArchived === "on" : undefined,
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
  const updatePayload: Database["public"]["Tables"]["batches"]["Update"] = {};

  if (parseResult.data.name !== undefined) updatePayload.name = parseResult.data.name;
  if (parseResult.data.year !== undefined) updatePayload.year = parseResult.data.year;
  if (parseResult.data.description !== undefined) updatePayload.description = parseResult.data.description || null;
  if (parseResult.data.is_archived !== undefined) updatePayload.is_archived = parseResult.data.is_archived;

  // Strict tenant scoping on record ID + tenant ID
  const { data, error } = await supabase
    .from("batches")
    .update(updatePayload)
    .eq("id", batchId)
    .eq("tenant_id", tenant.tenantId)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        data: null,
        error: "A batch with this name already exists in your workspace",
      };
    }
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      success: false,
      data: null,
      error: "Batch not found or unauthorized",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");
  revalidatePath(`/dashboard/batches/${batchId}`);

  return {
    success: true,
    data,
    error: null,
  };
}

/**
 * Toggles the archived status of a batch scoped to the caller's active tenant.
 */
export async function toggleBatchArchive(
  batchId: string,
  currentStatus: boolean
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("batches:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("batches")
    .update({ is_archived: !currentStatus })
    .eq("id", batchId)
    .eq("tenant_id", tenant.tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      success: false,
      data: null,
      error: "Batch not found or unauthorized",
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
 * Deletes a batch scoped to the caller's active tenant.
 * Requires explicit 'batches:delete' permission (owner/admin only; instructors cannot delete).
 */
export async function deleteBatch(batchId: string): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("batches:delete");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("batches")
    .delete()
    .eq("id", batchId)
    .eq("tenant_id", tenant.tenantId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      success: false,
      data: null,
      error: "Batch not found or unauthorized",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/batches");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}
