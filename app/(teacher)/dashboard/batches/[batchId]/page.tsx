// app/(teacher)/dashboard/batches/[batchId]/page.tsx
// Batch detail page with enrolled students list and content sections.

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentTable } from "@/components/students/StudentTable";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Users, BookOpen, Bell, Archive, Play, Pin } from "lucide-react";
import type { Profile, Lesson, Announcement } from "@/types";

export const instant = false;

interface BatchDetailPageProps {
  params: Promise<{ batchId: string }>;
}

export async function generateMetadata({ params }: BatchDetailPageProps) {
  const { batchId } = await params;
  const supabase = await createServerClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("name")
    .eq("id", batchId)
    .single();

  return {
    title: batch ? `${batch.name} — Edvora` : "Batch Details — Edvora",
  };
}

export default async function BatchDetailPage({ params }: BatchDetailPageProps) {
  const { batchId } = await params;
  const supabase = await createServerClient();

  // 1. Fetch batch information
  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (!batch) {
    notFound();
  }

  // 2. Fetch enrolled student IDs
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id, created_at")
    .eq("batch_id", batchId);

  const studentIds = enrollments?.map((e) => e.student_id) ?? [];
  let students: Profile[] = [];

  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", studentIds)
      .order("full_name", { ascending: true });

    students = profiles ?? [];
  }

  // 3. Fetch lessons assigned to this batch
  const { data: batchLessonsData } = await supabase
    .from("lesson_batches")
    .select("lesson_id")
    .eq("batch_id", batchId);

  const lessonIds = batchLessonsData?.map((lb) => lb.lesson_id) ?? [];
  let lessons: Lesson[] = [];

  if (lessonIds.length > 0) {
    const { data: lessonsData } = await supabase
      .from("lessons")
      .select("*")
      .in("id", lessonIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    lessons = lessonsData ?? [];
  }

  // 4. Fetch announcements relevant to this batch
  const { data: batchAnnData } = await supabase
    .from("announcement_batches")
    .select("announcement_id")
    .eq("batch_id", batchId);

  const scopedAnnIds = batchAnnData?.map((ab) => ab.announcement_id) ?? [];

  const { data: announcementsData } = await supabase
    .from("announcements")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const allAnnouncements: Announcement[] = announcementsData ?? [];
  const announcements = allAnnouncements.filter(
    (a) => a.is_broadcast || scopedAnnIds.includes(a.id)
  );

  return (
    <div>
      <PageHeader
        title={batch.name}
        description={batch.description ?? `A/L Examination Year ${batch.year}`}
        backHref="/dashboard/batches"
        badge={
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {batch.year}
            </Badge>
            {batch.is_archived && (
              <Badge variant="outline" className="text-muted-foreground gap-1 text-xs">
                <Archive className="h-3 w-3" />
                Archived
              </Badge>
            )}
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/batches/${batch.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Link>

            <Link
              href={`/dashboard/batches/${batch.id}/students/new`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span>Add Student</span>
            </Link>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-8">
        {/* Enrolled Students Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Enrolled Students ({students.length})
              </h2>
            </div>

            <Link
              href={`/dashboard/batches/${batch.id}/students/new`}
              className="text-xs font-semibold text-primary hover:underline"
            >
              + Add student
            </Link>
          </div>

          <StudentTable batchId={batch.id} students={students} />
        </section>

        {/* Milestone 3 & 4 Sections */}
        <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t">
          {/* Lessons Section */}
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-semibold text-foreground">
                  Lessons ({lessons.length})
                </h3>
              </div>
              <Link
                href={`/dashboard/lessons/new?batchId=${batch.id}`}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Lesson</span>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Video lessons assigned to {batch.name}.
            </p>

            {lessons.length === 0 ? (
              <div className="rounded-lg bg-muted/40 p-5 text-center text-xs text-muted-foreground">
                <p>No lessons assigned to this batch yet.</p>
                <Link
                  href={`/dashboard/lessons/new?batchId=${batch.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  <span>Assign first lesson</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {lessons.slice(0, 5).map((l) => (
                  <Link
                    key={l.id}
                    href={`/dashboard/lessons/${l.id}`}
                    className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </div>
                      <span className="truncate font-medium text-foreground">
                        {l.title}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground ml-2">
                      #{l.sort_order}
                    </span>
                  </Link>
                ))}

                {lessons.length > 5 && (
                  <Link
                    href={`/dashboard/lessons?batchId=${batch.id}`}
                    className="block text-center text-xs font-medium text-primary hover:underline pt-1"
                  >
                    View all {lessons.length} lessons →
                  </Link>
                )}
              </div>
            )}
          </section>

          {/* Announcements Section */}
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500" />
                <h3 className="text-base font-semibold text-foreground">
                  Announcements ({announcements.length})
                </h3>
              </div>
              <Link
                href={`/dashboard/announcements/new?batchId=${batch.id}`}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Post Notice</span>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Notices and reminders visible to this batch.
            </p>

            {announcements.length === 0 ? (
              <div className="rounded-lg bg-muted/40 p-5 text-center text-xs text-muted-foreground">
                <p>No notices posted for this batch yet.</p>
                <Link
                  href={`/dashboard/announcements/new?batchId=${batch.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  <span>Post first announcement</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {announcements.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border p-3 bg-muted/20 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground truncate">
                        {a.is_pinned && (
                          <Pin className="h-3 w-3 fill-amber-600 text-amber-600 shrink-0" />
                        )}
                        {a.is_broadcast && (
                          <Badge className="bg-indigo-600 text-white text-[9px] px-1 py-0">
                            Broadcast
                          </Badge>
                        )}
                        <span className="truncate">{a.title}</span>
                      </div>
                      <Link
                        href={`/dashboard/announcements/${a.id}/edit`}
                        className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                      >
                        Edit
                      </Link>
                    </div>
                    <p className="line-clamp-2 text-muted-foreground text-[11px]">
                      {a.body}
                    </p>
                  </div>
                ))}

                {announcements.length > 4 && (
                  <Link
                    href={`/dashboard/announcements?batchId=${batch.id}`}
                    className="block text-center text-xs font-medium text-primary hover:underline pt-1"
                  >
                    View all {announcements.length} announcements →
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
