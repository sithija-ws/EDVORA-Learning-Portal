// actions/lessons.ts
// Server Actions for lesson management (Teacher only).
// Privileged operations utilize createServerAdminClient() on the server.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient, createServerAdminClient } from "@/lib/supabase/server";
import { createLessonSchema, updateLessonSchema } from "@/lib/validators/lesson";
import { extractYouTubeId, buildThumbnailUrl } from "@/lib/utils/youtube";
import { ROLES } from "@/lib/constants";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Asserts the current user has the teacher role.
 */
async function assertTeacher(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: Please sign in");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== ROLES.TEACHER) {
    throw new Error("Forbidden: Teacher access required");
  }

  return user.id;
}

/**
 * Creates a new lesson and assigns it to the specified batches.
 */
export async function createLesson(
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
  const adminClient = createServerAdminClient();

  // 1. Insert lesson row
  const { data: lessonData, error: lessonError } = await adminClient
    .from("lessons")
    .insert({
      title,
      description: description || null,
      youtube_id,
      thumbnail_url,
      sort_order: sort_order ?? 0,
      created_by: teacherId,
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

  // 2. Insert junction rows into lesson_batches
  const lessonBatchRows = batch_ids.map((bId) => ({
    lesson_id: newLessonId,
    batch_id: bId,
  }));

  const { error: junctionError } = await adminClient
    .from("lesson_batches")
    .insert(lessonBatchRows);

  if (junctionError) {
    // Rollback lesson insertion
    await adminClient.from("lessons").delete().eq("id", newLessonId);
    return {
      success: false,
      data: null,
      error: `Failed to assign batches to lesson: ${junctionError.message}`,
    };
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
 * Updates an existing lesson's details and batch assignments.
 */
export async function updateLesson(
  lessonId: string,
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

  const adminClient = createServerAdminClient();
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

  if (Object.keys(lessonUpdates).length > 0) {
    const { error: updateError } = await adminClient
      .from("lessons")
      .update(lessonUpdates)
      .eq("id", lessonId);

    if (updateError) {
      return {
        success: false,
        data: null,
        error: updateError.message,
      };
    }
  }

  // Synchronize batch assignments if provided
  if (parseResult.data.batch_ids !== undefined) {
    const desiredBatchIds = new Set(parseResult.data.batch_ids);

    const { data: currentAssignments, error: fetchError } = await adminClient
      .from("lesson_batches")
      .select("batch_id")
      .eq("lesson_id", lessonId);

    if (fetchError) {
      return {
        success: false,
        data: null,
        error: fetchError.message,
      };
    }

    const currentBatchIds = new Set(currentAssignments.map((a) => a.batch_id));

    const toAdd = [...desiredBatchIds].filter((bId) => !currentBatchIds.has(bId));
    const toRemove = [...currentBatchIds].filter((bId) => !desiredBatchIds.has(bId));

    if (toRemove.length > 0) {
      const { error: removeError } = await adminClient
        .from("lesson_batches")
        .delete()
        .eq("lesson_id", lessonId)
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
        lesson_id: lessonId,
        batch_id: bId,
      }));

      const { error: addError } = await adminClient
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
 * Deletes a lesson and cascades to its batch junction records.
 */
export async function deleteLesson(lessonId: string): Promise<ActionResult<void>> {
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

  const { error } = await adminClient
    .from("lessons")
    .delete()
    .eq("id", lessonId);

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
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
 * Updates sort orders for a list of lessons.
 */
export async function reorderLessons(
  items: Array<{ id: string; sort_order: number }>
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

  const adminClient = createServerAdminClient();

  for (const item of items) {
    const { error } = await adminClient
      .from("lessons")
      .update({ sort_order: item.sort_order })
      .eq("id", item.id);

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
