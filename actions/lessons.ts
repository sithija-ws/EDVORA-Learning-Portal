// actions/lessons.ts
// Server Actions for lesson management with strict multi-tenant isolation.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/auth/tenant";
import { createLessonSchema, updateLessonSchema } from "@/lib/validators/lesson";
import { extractYouTubeId, buildThumbnailUrl } from "@/lib/utils/youtube";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates a new lesson and assigns it to batches within the caller's active tenant.
 */
export async function createLesson(
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("lessons:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const rawTitle = formData.get("title");
  const rawYoutubeUrl = formData.get("youtube_url");
  const rawDescription = formData.get("description");
  const rawSortOrder = formData.get("sort_order");
  const rawBatchIds = formData.getAll("batch_ids");

  const parseResult = createLessonSchema.safeParse({
    title: typeof rawTitle === "string" ? rawTitle : "",
    youtube_url: typeof rawYoutubeUrl === "string" ? rawYoutubeUrl : "",
    description: typeof rawDescription === "string" && rawDescription.trim() !== "" ? rawDescription : undefined,
    sort_order: typeof rawSortOrder === "string" && rawSortOrder.trim() !== "" ? parseInt(rawSortOrder, 10) : 0,
    batch_ids: rawBatchIds.filter((id): id is string => typeof id === "string" && id.trim() !== ""),
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid lesson data",
    };
  }

  const { title, youtube_url, description, sort_order, batch_ids } = parseResult.data;

  const youtube_id = extractYouTubeId(youtube_url);
  if (!youtube_id) {
    return {
      success: false,
      data: null,
      error: "Could not extract video ID from the provided YouTube URL",
    };
  }

  const thumbnail_url = buildThumbnailUrl(youtube_id);
  const supabase = await createServerClient();

  // Validate ownership of all related batches before creating associations
  if (batch_ids && batch_ids.length > 0) {
    const { data: validBatches, error: batchErr } = await supabase
      .from("batches")
      .select("id")
      .in("id", batch_ids)
      .eq("tenant_id", tenant.tenantId);

    if (batchErr || !validBatches || validBatches.length !== batch_ids.length) {
      return {
        success: false,
        data: null,
        error: "One or more selected batches are invalid or unauthorized",
      };
    }
  }

  // 1. Insert lesson row with tenant_id scoping
  const { data: lessonData, error: lessonError } = await supabase
    .from("lessons")
    .insert({
      tenant_id: tenant.tenantId,
      title,
      description: description || null,
      youtube_id,
      thumbnail_url,
      sort_order: sort_order ?? 0,
      created_by: tenant.userId,
    })
    .select("id")
    .single();

  if (lessonError || !lessonData) {
    return {
      success: false,
      data: null,
      error: `Failed to create lesson: ${lessonError?.message ?? "Unknown error"}`,
    };
  }

  const newLessonId = lessonData.id;

  // 2. Insert junction rows with tenant_id scoping
  if (batch_ids && batch_ids.length > 0) {
    const lessonBatchRows = batch_ids.map((bId) => ({
      tenant_id: tenant.tenantId,
      lesson_id: newLessonId,
      batch_id: bId,
    }));

    const { error: junctionError } = await supabase
      .from("lesson_batches")
      .insert(lessonBatchRows);

    if (junctionError) {
      await supabase
        .from("lessons")
        .delete()
        .eq("id", newLessonId)
        .eq("tenant_id", tenant.tenantId);
      return {
        success: false,
        data: null,
        error: `Failed to assign batches to lesson: ${junctionError.message}`,
      };
    }
  }

  // Revalidate cache paths
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/lessons");
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/lessons");
  batch_ids.forEach((bId) => revalidatePath(`/dashboard/batches/${bId}`));

  redirect("/dashboard/lessons");
}

/**
 * Updates an existing lesson's details and batch assignments within caller's active tenant.
 */
export async function updateLesson(
  lessonId: string,
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("lessons:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const rawTitle = formData.get("title");
  const rawYoutubeUrl = formData.get("youtube_url");
  const rawDescription = formData.get("description");
  const rawSortOrder = formData.get("sort_order");
  const rawBatchIds = formData.getAll("batch_ids");

  const parseResult = updateLessonSchema.safeParse({
    title: typeof rawTitle === "string" && rawTitle.trim() !== "" ? rawTitle : undefined,
    youtube_url: typeof rawYoutubeUrl === "string" && rawYoutubeUrl.trim() !== "" ? rawYoutubeUrl : undefined,
    description: typeof rawDescription === "string" ? rawDescription : undefined,
    sort_order: typeof rawSortOrder === "string" && rawSortOrder.trim() !== "" ? parseInt(rawSortOrder, 10) : undefined,
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
  const lessonUpdates: Database["public"]["Tables"]["lessons"]["Update"] = {};

  if (parseResult.data.title !== undefined) {
    lessonUpdates.title = parseResult.data.title;
  }
  if (parseResult.data.description !== undefined) {
    lessonUpdates.description = parseResult.data.description || null;
  }
  if (parseResult.data.sort_order !== undefined) {
    lessonUpdates.sort_order = parseResult.data.sort_order;
  }
  if (parseResult.data.youtube_url !== undefined) {
    const youtube_id = extractYouTubeId(parseResult.data.youtube_url);
    if (!youtube_id) {
      return {
        success: false,
        data: null,
        error: "Invalid YouTube URL format",
      };
    }
    lessonUpdates.youtube_id = youtube_id;
    lessonUpdates.thumbnail_url = buildThumbnailUrl(youtube_id);
  }

  // Verify lesson belongs to caller's tenant before updating (unconditional check)
  const { data: existingLesson, error: verifyError } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.tenantId)
    .maybeSingle();

  if (verifyError || !existingLesson) {
    return {
      success: false,
      data: null,
      error: "Lesson not found or unauthorized",
    };
  }

  // Apply lesson field updates if provided
  if (Object.keys(lessonUpdates).length > 0) {
    const { data: updatedLesson, error: updateError } = await supabase
      .from("lessons")
      .update(lessonUpdates)
      .eq("id", lessonId)
      .eq("tenant_id", tenant.tenantId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        success: false,
        data: null,
        error: updateError.message,
      };
    }

    if (!updatedLesson) {
      return {
        success: false,
        data: null,
        error: "Lesson not found or unauthorized",
      };
    }
  }

  // Synchronize batch assignments if provided, validating related batch ownership
  if (parseResult.data.batch_ids !== undefined) {
    const desiredBatchIds = new Set(parseResult.data.batch_ids);

    if (desiredBatchIds.size > 0) {
      const { data: validBatches, error: batchErr } = await supabase
        .from("batches")
        .select("id")
        .in("id", Array.from(desiredBatchIds))
        .eq("tenant_id", tenant.tenantId);

      if (batchErr || !validBatches || validBatches.length !== desiredBatchIds.size) {
        return {
          success: false,
          data: null,
          error: "One or more selected batches are invalid or unauthorized",
        };
      }
    }

    const { data: currentAssignments, error: fetchError } = await supabase
      .from("lesson_batches")
      .select("batch_id")
      .eq("lesson_id", lessonId)
      .eq("tenant_id", tenant.tenantId);

    if (fetchError) {
      return {
        success: false,
        data: null,
        error: fetchError.message,
      };
    }

    const currentBatchIds = new Set((currentAssignments ?? []).map((a) => a.batch_id));

    const toAdd = [...desiredBatchIds].filter((bId) => !currentBatchIds.has(bId));
    const toRemove = [...currentBatchIds].filter((bId) => !desiredBatchIds.has(bId));

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase
        .from("lesson_batches")
        .delete()
        .eq("lesson_id", lessonId)
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
      const insertRows = toAdd.map((bId) => ({
        tenant_id: tenant.tenantId,
        lesson_id: lessonId,
        batch_id: bId,
      }));

      const { error: addError } = await supabase
        .from("lesson_batches")
        .insert(insertRows);

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
  revalidatePath("/dashboard/lessons");
  revalidatePath(`/dashboard/lessons/${lessonId}`);
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/lessons");
  revalidatePath(`/home/lessons/${lessonId}`);

  return {
    success: true,
    data: undefined,
    error: null,
  };
}

/**
 * Deletes a lesson strictly scoped to caller's active tenant.
 */
export async function deleteLesson(lessonId: string): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("lessons:delete");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const supabase = await createServerClient();

  // Strict tenant scoping prevents deleting another workspace's lesson
  const { data, error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", lessonId)
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
      error: "Lesson not found or unauthorized",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/lessons");
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/lessons");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}

/**
 * Updates sort orders for a list of lessons strictly scoped to caller's active tenant.
 */
export async function reorderLessons(
  items: Array<{ id: string; sort_order: number }>
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("lessons:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  const supabase = await createServerClient();

  for (const item of items) {
    const { error } = await supabase
      .from("lessons")
      .update({ sort_order: item.sort_order })
      .eq("id", item.id)
      .eq("tenant_id", tenant.tenantId);

    if (error) {
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  }

  revalidatePath("/dashboard/lessons");
  revalidatePath("/home/lessons");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}
