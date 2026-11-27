// app/(teacher)/dashboard/announcements/[announcementId]/edit/page.tsx
// Page to edit an existing announcement's title, body, broadcast scope, or pinned status.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext, getTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";
import type { Announcement, Batch } from "@/types";

export const instant = false;

interface EditAnnouncementPageProps {
  params: Promise<{ announcementId: string }>;
}

export async function generateMetadata({ params }: EditAnnouncementPageProps) {
  const { announcementId } = await params;
  const tenantRes = await getTenantContext();
  if (tenantRes.status !== "resolved") {
    return { title: "Edit Announcement — Edvora" };
  }
  const supabase = await createServerClient();
  const { data: announcement } = await supabase
    .from("announcements")
    .select("title")
    .eq("id", announcementId)
    .eq("tenant_id", tenantRes.context.tenantId)
    .maybeSingle();

  return {
    title: announcement ? `Edit: ${announcement.title} — Edvora` : "Edit Announcement — Edvora",
  };
}

export default async function EditAnnouncementPage({
  params,
}: EditAnnouncementPageProps) {
  const { announcementId } = await params;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  // 1. Fetch announcement scoped to tenant
  const { data: announcementData } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", announcementId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (!announcementData) {
    notFound();
  }

  const announcement: Announcement = announcementData;

  // 2. Fetch current batch assignments scoped to tenant
  const { data: annBatches } = await supabase
    .from("announcement_batches")
    .select("batch_id")
    .eq("announcement_id", announcementId)
    .eq("tenant_id", tenant.tenantId);

  const currentBatchIds = annBatches?.map((ab) => ab.batch_id) ?? [];

  // 3. Fetch all batches scoped to tenant
  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];

  return (
    <div>
      <PageHeader
        title={`Edit Notice: ${announcement.title}`}
        description="Update notice content, target audience, or pinned status."
        backHref="/dashboard/announcements"
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <AnnouncementForm
            announcement={{
              ...announcement,
              batch_ids: currentBatchIds,
            }}
            batches={batches}
          />
        </div>
      </div>
    </div>
  );
}
