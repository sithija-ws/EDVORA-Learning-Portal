// actions/batches.ts
// Server Actions for batch management (Teacher only).

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createBatchSchema, updateBatchSchema } from "@/lib/validators/batch";
import type { ActionResult, Batch } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates a new tuition batch.
 */
export async function createBatch(
  _prevState: ActionResult<Batch> | null,
  formData: FormData
): Promise<ActionResult<Batch>> {
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
        error: "A batch with this name already exists",
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
 * Updates an existing batch.
 */
export async function updateBatch(
  batchId: string,
  _prevState: ActionResult<Batch> | null,
  formData: FormData
): Promise<ActionResult<Batch>> {
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

  const { data, error } = await supabase
    .from("batches")
    .update(updatePayload)
    .eq("id", batchId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        data: null,
        error: "A batch with this name already exists",
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
  revalidatePath(`/dashboard/batches/${batchId}`);

  return {
    success: true,
    data,
    error: null,
  };
}

/**
 * Toggles the archived status of a batch.
 */
export async function toggleBatchArchive(
  batchId: string,
  currentStatus: boolean
): Promise<ActionResult<void>> {
  const supabase = await createServerClient();

  const { error } = await supabase
    .from("batches")
    .update({ is_archived: !currentStatus })
    .eq("id", batchId);

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
