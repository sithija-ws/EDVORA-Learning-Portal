// actions/notes.ts
// Server Actions for PDF study notes management (Teacher only).
// File uploads are handled via Supabase Storage using privileged admin client.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerAdminClient } from "@/lib/supabase/server";
import { assertTeacher } from "@/lib/auth/assert";
import { createNoteSchema, updateNoteSchema } from "@/lib/validators/note";
import { MAX_PDF_FILE_SIZE } from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Ensures the notes storage bucket exists and is public.
 */
async function ensureNotesBucket(adminClient: ReturnType<typeof createServerAdminClient>) {
  try {
    await adminClient.storage.createBucket("notes", {
      public: true,
      fileSizeLimit: MAX_PDF_FILE_SIZE,
      allowedMimeTypes: ["application/pdf"],
    });
  } catch {
    // Bucket likely already exists, ignore
  }
}

/**
 * Creates a new note with PDF upload and assigns it to batches.
 */
export async function createNote(
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let teacherId: string;
  try {
    teacherId = await assertTeacher();
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

  const adminClient = createServerAdminClient();
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

    await ensureNotesBucket(adminClient);

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${Date.now()}_${sanitizedName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
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

    const { data: urlData } = adminClient.storage
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

  // Insert Note record
  const { data: insertedNote, error: insertError } = await adminClient
    .from("notes")
    .insert({
      title: validation.data.title,
      description: validation.data.description ?? null,
      file_url: finalFileUrl,
      file_name: finalFileName,
      file_size: finalFileSize,
      created_by: teacherId,
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

  // Insert batch assignments
  const junctionRows = validation.data.batch_ids.map((bId) => ({
    note_id: insertedNote.id,
    batch_id: bId,
  }));

  const { error: junctionError } = await adminClient
    .from("note_batches")
    .insert(junctionRows);

  if (junctionError) {
    await adminClient.from("notes").delete().eq("id", insertedNote.id);
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
 * Updates an existing note.
 */
export async function updateNote(
  noteId: string,
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await assertTeacher();
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

  const adminClient = createServerAdminClient();

  // If a new PDF file was provided, upload it
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

    await ensureNotesBucket(adminClient);

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${Date.now()}_${sanitizedName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
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

    const { data: urlData } = adminClient.storage
      .from("notes")
      .getPublicUrl(storagePath);

    updatePayload.file_url = urlData.publicUrl;
    updatePayload.file_name = file.name;
    updatePayload.file_size = file.size;
  } else if (externalUrl) {
    updatePayload.file_url = externalUrl;
  }

  const { error: updateError } = await adminClient
    .from("notes")
    .update(updatePayload)
    .eq("id", noteId);

  if (updateError) {
    return {
      success: false,
      data: null,
      error: `Failed to update note: ${updateError.message}`,
    };
  }

  // Update batch assignments if provided
  if (validation.data.batch_ids && validation.data.batch_ids.length > 0) {
    await adminClient.from("note_batches").delete().eq("note_id", noteId);

    const junctionRows = validation.data.batch_ids.map((bId) => ({
      note_id: noteId,
      batch_id: bId,
    }));

    await adminClient.from("note_batches").insert(junctionRows);
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
 */
export async function deleteNote(noteId: string): Promise<ActionResult<void>> {
  try {
    await assertTeacher();
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const adminClient = createServerAdminClient();

  const { error } = await adminClient.from("notes").delete().eq("id", noteId);

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
