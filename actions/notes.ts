// actions/notes.ts
// Server Actions for PDF study notes management (Staff only).
// Fully migrated to tenant-aware authorization, explicit permissions, and tenant storage isolation.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/auth/tenant";
import { createNoteSchema, updateNoteSchema } from "@/lib/validators/note";
import { MAX_PDF_FILE_SIZE } from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates a new note with PDF upload and assigns it to batches.
 * Scopes storage path under {tenant_id}/* and records under tenant_id.
 */
export async function createNote(
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("notes:upload_manage");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const title = (formData.get("title") as string | null) ?? "";
  const description = (formData.get("description") as string | null) || undefined;
  const batchIds = formData.getAll("batch_ids") as string[];
  const externalUrl = (formData.get("file_url") as string | null) || undefined;
  const file = formData.get("file") as File | null;

  const validation = createNoteSchema.safeParse({
    title,
    description,
    batch_ids: batchIds,
    file_url: externalUrl,
  });

  if (!validation.success) {
    return {
      success: false,
      data: null,
      error: validation.error.issues[0]?.message ?? "Invalid note input",
    };
  }

  const supabase = await createServerClient();

  // Validate that all target batches belong to the caller's tenant
  const { data: validBatches, error: batchCheckError } = await supabase
    .from("batches")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .in("id", validation.data.batch_ids);

  if (batchCheckError || !validBatches || validBatches.length !== validation.data.batch_ids.length) {
    return {
      success: false,
      data: null,
      error: "One or more selected batches do not exist or belong to another workspace",
    };
  }

  let finalFileUrl = externalUrl ?? "";
  let finalFileName = "document.pdf";
  let finalFileSize: number | null = null;

  // Handle direct PDF file upload
  if (file && file.size > 0) {
    if (file.size > MAX_PDF_FILE_SIZE) {
      return {
        success: false,
        data: null,
        error: "PDF file size must be 50 MB or less",
      };
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return {
        success: false,
        data: null,
        error: "Only PDF documents (.pdf) are allowed",
      };
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Multi-tenant storage path: {tenant_id}/{timestamp}_{filename}
    const storagePath = `${tenant.tenantId}/${Date.now()}_${sanitizedName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("notes")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        data: null,
        error: `Failed to upload PDF: ${uploadError.message}`,
      };
    }

    const { data: urlData } = supabase.storage
      .from("notes")
      .getPublicUrl(storagePath);

    finalFileUrl = urlData.publicUrl;
    finalFileName = file.name;
    finalFileSize = file.size;
  } else if (!externalUrl) {
    return {
      success: false,
      data: null,
      error: "Please upload a PDF file or provide a valid PDF document link",
    };
  } else {
    // External link fallback
    finalFileName = title.replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";
  }

  // Insert Note record scoped to tenant
  const { data: insertedNote, error: insertError } = await supabase
    .from("notes")
    .insert({
      tenant_id: tenant.tenantId,
      title: validation.data.title,
      description: validation.data.description ?? null,
      file_url: finalFileUrl,
      file_name: finalFileName,
      file_size: finalFileSize,
      created_by: tenant.userId,
    })
    .select("id")
    .single();

  if (insertError || !insertedNote) {
    return {
      success: false,
      data: null,
      error: `Failed to create note: ${insertError?.message ?? "Database error"}`,
    };
  }

  // Insert batch assignments scoped to tenant
  const junctionRows = validation.data.batch_ids.map((bId) => ({
    tenant_id: tenant.tenantId,
    note_id: insertedNote.id,
    batch_id: bId,
  }));

  const { error: junctionError } = await supabase
    .from("note_batches")
    .insert(junctionRows);

  if (junctionError) {
    await supabase
      .from("notes")
      .delete()
      .eq("id", insertedNote.id)
      .eq("tenant_id", tenant.tenantId);

    return {
      success: false,
      data: null,
      error: `Failed to assign note to batches: ${junctionError.message}`,
    };
  }

  revalidatePath("/dashboard/notes");
  revalidatePath("/dashboard");
  revalidatePath("/home/notes");
  revalidatePath("/home");

  redirect("/dashboard/notes");
}

/**
 * Updates an existing note and verifies tenant ownership.
 */
export async function updateNote(
  noteId: string,
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("notes:upload_manage");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const title = (formData.get("title") as string | null) ?? "";
  const description = (formData.get("description") as string | null) || undefined;
  const batchIds = formData.getAll("batch_ids") as string[];
  const externalUrl = (formData.get("file_url") as string | null) || undefined;
  const file = formData.get("file") as File | null;

  const validation = updateNoteSchema.safeParse({
    title,
    description,
    batch_ids: batchIds.length > 0 ? batchIds : undefined,
    file_url: externalUrl,
  });

  if (!validation.success) {
    return {
      success: false,
      data: null,
      error: validation.error.issues[0]?.message ?? "Invalid note input",
    };
  }

  const supabase = await createServerClient();

  // Verify note exists and belongs to this tenant
  const { data: existingNote, error: findError } = await supabase
    .from("notes")
    .select("id, file_url")
    .eq("id", noteId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (findError || !existingNote) {
    return {
      success: false,
      data: null,
      error: "Note not found or access denied",
    };
  }

  // If new batches provided, validate their tenant ownership
  if (validation.data.batch_ids && validation.data.batch_ids.length > 0) {
    const { data: validBatches, error: batchCheckError } = await supabase
      .from("batches")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .in("id", validation.data.batch_ids);

    if (batchCheckError || !validBatches || validBatches.length !== validation.data.batch_ids.length) {
      return {
        success: false,
        data: null,
        error: "One or more selected batches do not exist or belong to another workspace",
      };
    }
  }

  const updatePayload: Database["public"]["Tables"]["notes"]["Update"] = {
    title: validation.data.title,
    description: validation.data.description ?? null,
    updated_at: new Date().toISOString(),
  };

  if (file && file.size > 0) {
    if (file.size > MAX_PDF_FILE_SIZE) {
      return {
        success: false,
        data: null,
        error: "PDF file size must be 50 MB or less",
      };
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return {
        success: false,
        data: null,
        error: "Only PDF documents (.pdf) are allowed",
      };
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${tenant.tenantId}/${Date.now()}_${sanitizedName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("notes")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        data: null,
        error: `Failed to upload replacement PDF: ${uploadError.message}`,
      };
    }

    const { data: urlData } = supabase.storage
      .from("notes")
      .getPublicUrl(storagePath);

    updatePayload.file_url = urlData.publicUrl;
    updatePayload.file_name = file.name;
    updatePayload.file_size = file.size;
  } else if (externalUrl) {
    updatePayload.file_url = externalUrl;
  }

  const { error: updateError } = await supabase
    .from("notes")
    .update(updatePayload)
    .eq("id", noteId)
    .eq("tenant_id", tenant.tenantId);

  if (updateError) {
    return {
      success: false,
      data: null,
      error: `Failed to update note: ${updateError.message}`,
    };
  }

  // Update batch assignments if provided
  if (validation.data.batch_ids && validation.data.batch_ids.length > 0) {
    await supabase
      .from("note_batches")
      .delete()
      .eq("note_id", noteId)
      .eq("tenant_id", tenant.tenantId);

    const junctionRows = validation.data.batch_ids.map((bId) => ({
      tenant_id: tenant.tenantId,
      note_id: noteId,
      batch_id: bId,
    }));

    await supabase.from("note_batches").insert(junctionRows);
  }

  revalidatePath("/dashboard/notes");
  revalidatePath(`/dashboard/notes/${noteId}`);
  revalidatePath("/home/notes");
  revalidatePath(`/home/notes/${noteId}`);
  revalidatePath("/home");

  redirect("/dashboard/notes");
}

/**
 * Deletes a note and its batch assignments.
 * Enforces tenant boundary and permissions.
 */
export async function deleteNote(noteId: string): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("notes:delete");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const supabase = await createServerClient();

  const { data: existingNote, error: findError } = await supabase
    .from("notes")
    .select("id, file_url")
    .eq("id", noteId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (findError || !existingNote) {
    return {
      success: false,
      data: null,
      error: "Note not found or access denied",
    };
  }

  // Attempt storage file cleanup if stored in tenant namespace
  try {
    const urlParts = existingNote.file_url.split("/notes/");
    if (urlParts.length > 1) {
      const filePath = decodeURIComponent(urlParts[1]);
      if (filePath.startsWith(`${tenant.tenantId}/`)) {
        await supabase.storage.from("notes").remove([filePath]);
      }
    }
  } catch {
    // Non-blocking storage removal
  }

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("tenant_id", tenant.tenantId);

  if (error) {
    return {
      success: false,
      data: null,
      error: `Failed to delete note: ${error.message}`,
    };
  }

  revalidatePath("/dashboard/notes");
  revalidatePath("/dashboard");
  revalidatePath("/home/notes");
  revalidatePath("/home");

  return { success: true, data: undefined, error: null };
}
