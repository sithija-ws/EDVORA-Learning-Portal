// app/(student)/home/announcements/page.tsx
// Student announcements feed — displays broadcast and enrolled batch notices.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnnouncementCard } from "@/components/announcements/AnnouncementCard";
import type { Announcement, Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Announcements — Edvora",
};

interface StudentAnnouncementsPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function StudentAnnouncementsPage({
  searchParams,
}: StudentAnnouncementsPageProps) {
  const { batchId } = await searchParams;
  const supabase = await createServerClient();

  // 1. Authenticate student
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Verify active profile, enrolled batches, and tenant memberships in parallel
  const [{ data: profile }, { data: enrollments }, { data: identities }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("batch_id, tenant_id")
      .eq("student_id", user.id),
    supabase
      .from("student_identities")
      .select("tenant_id")
      .eq("student_id", user.id),
  ]);

  if (!profile || !profile.is_active) {
    redirect("/disabled");
  }

  const enrolledBatchIds = enrollments?.map((e) => e.batch_id) ?? [];
  const studentTenantIds = Array.from(
    new Set([
      ...(identities?.map((i) => i.tenant_id) ?? []),
      ...((enrollments?.map((e) => e.tenant_id).filter(Boolean) as string[]) ?? []),
    ])
  );

  if (enrolledBatchIds.length === 0 || studentTenantIds.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader
          title="Announcements"
          description="Class notices, schedule updates, and exam advice."
        />
        <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">
            Not enrolled in any batches yet
          </h3>
          <p className="mt-1 text-xs max-w-sm mx-auto">
            Your teacher has not assigned you to any tuition batches yet.
          </p>
        </div>
      </div>
    );
  }

  // Selected batch filter
  const effectiveBatchFilter =
    batchId && enrolledBatchIds.includes(batchId) ? batchId : null;

  const targetBatchIds = effectiveBatchFilter
    ? [effectiveBatchFilter]
    : enrolledBatchIds;

  // 3. Stage 2 concurrent fetch: batches, announcement_batches, and announcements in parallel scoped to tenant
  const [{ data: batchesData }, { data: annBatchesData }, { data: announcementsData }] =
    await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .in("id", enrolledBatchIds)
        .in("tenant_id", studentTenantIds)
        .order("year", { ascending: false }),
      supabase
        .from("announcement_batches")
        .select("announcement_id, batch_id")
        .in("batch_id", targetBatchIds)
        .in("tenant_id", studentTenantIds),
      supabase
        .from("announcements")
        .select("*")
        .in("tenant_id", studentTenantIds)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const enrolledBatches: Batch[] = batchesData ?? [];
  const batchMap = new Map(enrolledBatches.map((b) => [b.id, b]));

  const annToBatchesMap = new Map<string, Batch[]>();
  const scopedAnnIdSet = new Set<string>();

  annBatchesData?.forEach((ab) => {
    scopedAnnIdSet.add(ab.announcement_id);
    const b = batchMap.get(ab.batch_id);
    if (b) {
      const existing = annToBatchesMap.get(ab.announcement_id) || [];
      existing.push(b);
      annToBatchesMap.set(ab.announcement_id, existing);
    }
  });

  const allNotices: Announcement[] = announcementsData ?? [];
  const selectedBatch = effectiveBatchFilter ? batchMap.get(effectiveBatchFilter) : null;
  const selectedBatchTenantId = selectedBatch?.tenant_id;
  const enrolledTenantIds = new Set(enrolledBatches.map((b) => b.tenant_id));

  // Filter: Broadcast notices strictly from relevant workspace OR notices assigned to student's enrolled batches
  const studentAnnouncements = allNotices.filter((a) => {
    if (effectiveBatchFilter) {
      // If student filtered by specific batch: show notices explicitly targeted to that batch,
      // or broadcast notices strictly within the SAME workspace/tenant as that batch.
      return scopedAnnIdSet.has(a.id) || (a.is_broadcast && a.tenant_id === selectedBatchTenantId);
    }
    // If viewing all batches: broadcast notice must belong to a workspace the student has enrolled batches in,
    // or the notice must be explicitly assigned to one of their enrolled batches.
    return (a.is_broadcast && enrolledTenantIds.has(a.tenant_id)) || scopedAnnIdSet.has(a.id);
  });

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-6 pb-0">
        <PageHeader
          title="Announcements"
          description="Class notices, schedule updates, and important announcements."
        />

        {/* Multi-batch filter tabs */}
        {enrolledBatches.length > 1 && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <Link
              href="/home/announcements"
              className={`rounded-full px-3 py-1 font-medium transition-colors shrink-0 ${
                !effectiveBatchFilter
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All Notices
            </Link>

            {enrolledBatches.map((b) => {
              const isActive = effectiveBatchFilter === b.id;
              return (
                <Link
                  key={b.id}
                  href={`/home/announcements?batchId=${b.id}`}
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
      </div>

      <div className="p-4 sm:p-6 pt-2">
        {studentAnnouncements.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-sm">
              No announcements right now
            </h3>
            <p className="mt-1 text-xs max-w-sm mx-auto">
              Any notices posted by your teacher will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">
            {studentAnnouncements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                batches={annToBatchesMap.get(announcement.id) ?? []}
                role="student"
                showActions={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
