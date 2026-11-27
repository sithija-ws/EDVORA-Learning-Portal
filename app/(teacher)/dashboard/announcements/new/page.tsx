// app/(teacher)/dashboard/announcements/new/page.tsx
// Page to compose a new announcement and target batches or broadcast.

import React from "react";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";
import type { Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "New Announcement — Edvora",
};

interface NewAnnouncementPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function NewAnnouncementPage({
  searchParams,
}: NewAnnouncementPageProps) {
  const { batchId } = await searchParams;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];
  const preSelectedBatch = batches.find((b) => b.id === batchId);

  return (
    <div>
      <PageHeader
        title="Post Announcement"
        description={
          preSelectedBatch
            ? `Compose a notice for ${preSelectedBatch.name}.`
            : "Compose a notice and broadcast to all students or specific batches."
        }
        backHref={
          batchId
            ? `/dashboard/batches/${batchId}`
            : "/dashboard/announcements"
        }
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <AnnouncementForm
            batches={batches}
            preSelectedBatchId={batchId}
          />
        </div>
      </div>
    </div>
  );
}
