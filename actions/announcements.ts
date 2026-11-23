// actions/announcements.ts
// Server Actions for announcement management (Teacher only).
// Privileged operations utilize createServerAdminClient() on the server.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerAdminClient } from "@/lib/supabase/server";
import { assertTeacher } from "@/lib/auth/assert";
import { createAnnouncementSchema, updateAnnouncementSchema } from "@/lib/validators/announcement";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates an announcement (broadcast to all or scoped to specific batches).
 */
export async function createAnnouncement(
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
  const rawBody = formData.get("body");
  const rawIsBroadcast = formData.get("is_broadcast");
  const rawIsPinned = formData.get("is_pinned");
  const rawBatchIds = formData.getAll("batch_ids");

  const is_broadcast = rawIsBroadcast === "true" || rawIsBroadcast === "on";
  const is_pinned = rawIsPinned === "true" || rawIsPinned === "on";

  const parseResult = createAnnouncementSchema.safeParse({
    title: typeof rawTitle === "string" ? rawTitle : "",
    body: typeof rawBody === "string" ? rawBody : "",
    is_broadcast,
    is_pinned,
    batch_ids: rawBatchIds.filter((id): id is string => typeof id === "string" && id.trim() !== ""),
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid announcement data",
    };
  }

  const { title, body, batch_ids } = parseResult.data;
  const adminClient = createServerAdminClient();

  // 1. Insert announcement row
  const { data: annData, error: annError } = await adminClient
    .from("announcements")
    .insert({
      title,
      body,
      is_broadcast,
      is_pinned,
      created_by: teacherId,
    })
    .select("id")
    .single();

  if (annError || !annData) {
    return {
      success: false,
      data: null,
      error: `Failed to create announcement: ${annError?.message ?? "Unknown error"}`,
    };
  }

  const newAnnId = annData.id;

  // 2. Insert junction rows into announcement_batches if not broadcast
  if (!is_broadcast && batch_ids && batch_ids.length > 0) {
    const junctionRows = batch_ids.map((bId) => ({
      announcement_id: newAnnId,
      batch_id: bId,
    }));

    const { error: junctionError } = await adminClient
      .from("announcement_batches")
      .insert(junctionRows);

    if (junctionError) {
      await adminClient.from("announcements").delete().eq("id", newAnnId);
      return {
        success: false,
        data: null,
        error: `Failed to assign batches to announcement: ${junctionError.message}`,
      };
    }
  }

  // Revalidate cache paths
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/announcements");
  if (batch_ids) {
    batch_ids.forEach((bId) => revalidatePath(`/dashboard/batches/${bId}`));
  }

  redirect("/dashboard/announcements");
}

/**
 * Updates an announcement's content, broadcast flag, pinned status, or batch assignments.
 */
export async function updateAnnouncement(
  announcementId: string,
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
  const rawBody = formData.get("body");
  const rawIsBroadcast = formData.get("is_broadcast");
  const rawIsPinned = formData.get("is_pinned");
  const rawBatchIds = formData.getAll("batch_ids");

  const is_broadcast = rawIsBroadcast !== null ? rawIsBroadcast === "true" || rawIsBroadcast === "on" : undefined;
  const is_pinned = rawIsPinned !== null ? rawIsPinned === "true" || rawIsPinned === "on" : undefined;

  const parseResult = updateAnnouncementSchema.safeParse({
    title: typeof rawTitle === "string" && rawTitle.trim() !== "" ? rawTitle : undefined,
    body: typeof rawBody === "string" && rawBody.trim() !== "" ? rawBody : undefined,
    is_broadcast,
    is_pinned,
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
  const annUpdates: Database["public"]["Tables"]["announcements"]["Update"] = {};

  if (parseResult.data.title !== undefined) annUpdates.title = parseResult.data.title;
  if (parseResult.data.body !== undefined) annUpdates.body = parseResult.data.body;
  if (parseResult.data.is_broadcast !== undefined) annUpdates.is_broadcast = parseResult.data.is_broadcast;
  if (parseResult.data.is_pinned !== undefined) annUpdates.is_pinned = parseResult.data.is_pinned;

  if (Object.keys(annUpdates).length > 0) {
    const { error: updateError } = await adminClient
      .from("announcements")
      .update(annUpdates)
      .eq("id", announcementId);

    if (updateError) {
      return {
        success: false,
        data: null,
        error: updateError.message,
      };
    }
  }

  // Handle batch assignment changes
  if (parseResult.data.is_broadcast === true) {
    // If converted to broadcast, remove all scoped batch links
    await adminClient
      .from("announcement_batches")
      .delete()
      .eq("announcement_id", announcementId);
  } else if (parseResult.data.batch_ids !== undefined) {
    const desiredBatchIds = new Set(parseResult.data.batch_ids);

    const { data: currentAssignments, error: fetchError } = await adminClient
      .from("announcement_batches")
      .select("batch_id")
      .eq("announcement_id", announcementId);

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
      await adminClient
        .from("announcement_batches")
        .delete()
        .eq("announcement_id", announcementId)
        .in("batch_id", toRemove);
    }

    if (toAdd.length > 0) {
      const insertRows = toAdd.map((bId) => ({
        announcement_id: announcementId,
        batch_id: bId,
      }));

      await adminClient.from("announcement_batches").insert(insertRows);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/announcements");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}

/**
 * Deletes an announcement.
 */
export async function deleteAnnouncement(announcementId: string): Promise<ActionResult<void>> {
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
    .from("announcements")
    .delete()
    .eq("id", announcementId);

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/announcements");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}

/**
 * Toggles the pinned status of an announcement.
 */
export async function toggleAnnouncementPin(
  announcementId: string,
  currentPinned: boolean
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

  const { error } = await adminClient
    .from("announcements")
    .update({ is_pinned: !currentPinned })
    .eq("id", announcementId);

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard/batches");
  revalidatePath("/home");
  revalidatePath("/home/announcements");

  return {
    success: true,
    data: undefined,
    error: null,
  };
}
