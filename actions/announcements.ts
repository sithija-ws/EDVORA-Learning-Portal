// actions/announcements.ts
// Server Actions for announcement management (Staff only).
// Fully migrated to tenant-aware authorization and explicit operational permissions.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/auth/tenant";
import { createAnnouncementSchema, updateAnnouncementSchema } from "@/lib/validators/announcement";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";

/**
 * Creates an announcement (broadcast to all or scoped to specific batches).
 * Enforces tenant isolation, operational permissions, and batch ownership validation.
 */
export async function createAnnouncement(
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("announcements:create_edit");
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
  const supabase = await createServerClient();

  // Validate that all specified batches belong to the caller's authorized tenant
  if (!is_broadcast && batch_ids && batch_ids.length > 0) {
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
  }

  // 1. Insert announcement row with tenant_id scoping
  const { data: annData, error: annError } = await supabase
    .from("announcements")
    .insert({
      tenant_id: tenant.tenantId,
      title,
      body,
      is_broadcast,
      is_pinned,
      created_by: tenant.userId,
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
      tenant_id: tenant.tenantId,
      announcement_id: newAnnId,
      batch_id: bId,
    }));

    const { error: junctionError } = await supabase
      .from("announcement_batches")
      .insert(junctionRows);

    if (junctionError) {
      // Rollback newly created announcement scoped to this tenant
      await supabase
        .from("announcements")
        .delete()
        .eq("id", newAnnId)
        .eq("tenant_id", tenant.tenantId);

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
 * Strictly verifies tenant boundary before modifying records.
 */
export async function updateAnnouncement(
  announcementId: string,
  _prevState: ActionResult<void> | null,
  formData: FormData
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("announcements:create_edit");
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

  const supabase = await createServerClient();

  // Verify the target announcement belongs to the caller's tenant
  const { data: existingAnn, error: verifyError } = await supabase
    .from("announcements")
    .select("id, is_broadcast")
    .eq("id", announcementId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (verifyError || !existingAnn) {
    return {
      success: false,
      data: null,
      error: "Announcement not found or access denied",
    };
  }

  // Validate batch IDs if provided
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

  const annUpdates: Database["public"]["Tables"]["announcements"]["Update"] = {};
  if (parseResult.data.title !== undefined) annUpdates.title = parseResult.data.title;
  if (parseResult.data.body !== undefined) annUpdates.body = parseResult.data.body;
  if (parseResult.data.is_broadcast !== undefined) annUpdates.is_broadcast = parseResult.data.is_broadcast;
  if (parseResult.data.is_pinned !== undefined) annUpdates.is_pinned = parseResult.data.is_pinned;

  if (Object.keys(annUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from("announcements")
      .update(annUpdates)
      .eq("id", announcementId)
      .eq("tenant_id", tenant.tenantId);

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
    await supabase
      .from("announcement_batches")
      .delete()
      .eq("announcement_id", announcementId)
      .eq("tenant_id", tenant.tenantId);
  } else if (parseResult.data.batch_ids !== undefined) {
    const desiredBatchIds = new Set(parseResult.data.batch_ids);

    const { data: currentAssignments, error: fetchError } = await supabase
      .from("announcement_batches")
      .select("batch_id")
      .eq("announcement_id", announcementId)
      .eq("tenant_id", tenant.tenantId);

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
      await supabase
        .from("announcement_batches")
        .delete()
        .eq("announcement_id", announcementId)
        .eq("tenant_id", tenant.tenantId)
        .in("batch_id", toRemove);
    }

    if (toAdd.length > 0) {
      const insertRows = toAdd.map((bId) => ({
        tenant_id: tenant.tenantId,
        announcement_id: announcementId,
        batch_id: bId,
      }));

      await supabase.from("announcement_batches").insert(insertRows);
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
 * Verifies caller belongs to the tenant and holds announcements:delete permission.
 */
export async function deleteAnnouncement(announcementId: string): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("announcements:delete");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const supabase = await createServerClient();

  const { data: existing, error: findError } = await supabase
    .from("announcements")
    .select("id")
    .eq("id", announcementId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (findError || !existing) {
    return {
      success: false,
      data: null,
      error: "Announcement not found or access denied",
    };
  }

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .eq("tenant_id", tenant.tenantId);

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
 * Enforces tenant isolation.
 */
export async function toggleAnnouncementPin(
  announcementId: string,
  currentPinned: boolean
): Promise<ActionResult<void>> {
  let tenant;
  try {
    tenant = await requireActiveSubscription("announcements:create_edit");
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const supabase = await createServerClient();

  const { data: existing, error: findError } = await supabase
    .from("announcements")
    .select("id")
    .eq("id", announcementId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (findError || !existing) {
    return {
      success: false,
      data: null,
      error: "Announcement not found or access denied",
    };
  }

  const { error } = await supabase
    .from("announcements")
    .update({ is_pinned: !currentPinned })
    .eq("id", announcementId)
    .eq("tenant_id", tenant.tenantId);

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
