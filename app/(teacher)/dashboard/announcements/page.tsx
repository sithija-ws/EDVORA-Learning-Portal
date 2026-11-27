// app/(teacher)/dashboard/announcements/page.tsx
// Teacher announcements management hub — list all notices with batch filtering and creation.

import React from "react";
import Link from "next/link";
import { Plus, Bell } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnnouncementCard } from "@/components/announcements/AnnouncementCard";
import type { Announcement, Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Announcements — Edvora",
};

interface AnnouncementsPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function TeacherAnnouncementsPage({
  searchParams,
}: AnnouncementsPageProps) {
  const { batchId } = await searchParams;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  // 1. Fetch batches, junctions, and announcements concurrently in 1 parallel roundtrip scoped to tenant
  const [{ data: batchesData }, { data: annBatchesData }, { data: announcementsData }] =
    await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .eq("tenant_id", tenant.tenantId)
        .order("year", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("announcement_batches")
        .select("announcement_id, batch_id")
        .eq("tenant_id", tenant.tenantId),
      supabase
        .from("announcements")
        .select("*")
        .eq("tenant_id", tenant.tenantId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const batches: Batch[] = batchesData ?? [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  const annToBatchesMap = new Map<string, Batch[]>();
  const scopedAnnIdsForBatch = new Set<string>();

  annBatchesData?.forEach((ab) => {
    const b = batchMap.get(ab.batch_id);
    if (b) {
      const existing = annToBatchesMap.get(ab.announcement_id) || [];
      existing.push(b);
      annToBatchesMap.set(ab.announcement_id, existing);
    }
    if (batchId && ab.batch_id === batchId) {
      scopedAnnIdsForBatch.add(ab.announcement_id);
    }
  });

  let allAnnouncements: Announcement[] = announcementsData ?? [];

  // Filter if batchId is selected: broadcast announcements OR announcements scoped to this batch
  if (batchId) {
    allAnnouncements = allAnnouncements.filter(
      (a) => a.is_broadcast || scopedAnnIdsForBatch.has(a.id)
    );
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Broadcast notices to all students or target specific tuition batches."
        action={
          <Link
            href={
              batchId
                ? `/dashboard/announcements/new?batchId=${batchId}`
                : "/dashboard/announcements/new"
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>New Announcement</span>
          </Link>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Batch Filter Tabs */}
        {batches.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs">
            <span className="text-muted-foreground shrink-0 font-medium mr-1">
              Filter:
            </span>
            <Link
              href="/dashboard/announcements"
              className={`rounded-full px-3 py-1 font-medium transition-colors shrink-0 ${
                !batchId
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All Notices
            </Link>

            {batches.map((b) => {
              const isActive = batchId === b.id;
              return (
                <Link
                  key={b.id}
                  href={`/dashboard/announcements?batchId=${b.id}`}
                  className={`rounded-full px-3 py-1 font-medium transition-colors shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {b.name}
                </Link>
              );
            })}
          </div>
        )}

        {/* Announcements List or Empty State */}
        {allAnnouncements.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-4">
              <Bell className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {batchId
                ? "No announcements for this batch"
                : "No announcements posted yet"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Share class reminders, schedule changes, or exam tips with your students.
            </p>
            <div className="mt-6">
              <Link
                href={
                  batchId
                    ? `/dashboard/announcements/new?batchId=${batchId}`
                    : "/dashboard/announcements/new"
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                <span>Post First Announcement</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">
            {allAnnouncements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                batches={annToBatchesMap.get(announcement.id) ?? []}
                role="teacher"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
