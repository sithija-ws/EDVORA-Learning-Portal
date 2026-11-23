// app/(teacher)/dashboard/lessons/page.tsx
// Teacher lessons management hub — list all lessons with batch filtering and creation.

import React from "react";
import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { LessonCard } from "@/components/lessons/LessonCard";
import type { Lesson, Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Lessons — Edvora",
};

interface LessonsPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function TeacherLessonsPage({
  searchParams,
}: LessonsPageProps) {
  const { batchId } = await searchParams;
  const supabase = await createServerClient();

  let batchesData: Batch[] | null = null;
  let lessonBatchesData: { lesson_id: string; batch_id: string }[] | null = null;
  let lessonsData: Lesson[] | null = null;

  if (!batchId) {
    // Fast-path: When viewing all lessons (default), fetch batches, junctions, and lessons concurrently in 1 parallel roundtrip
    const [bRes, lbRes, lRes] = await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .order("year", { ascending: false })
        .order("name", { ascending: true }),
      supabase.from("lesson_batches").select("lesson_id, batch_id"),
      supabase
        .from("lessons")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);
    batchesData = bRes.data;
    lessonBatchesData = lbRes.data;
    lessonsData = lRes.data;
  } else {
    // When batchId filter is specified, fetch batches & junctions first to resolve batch-assigned lesson IDs
    const [bRes, lbRes] = await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .order("year", { ascending: false })
        .order("name", { ascending: true }),
      supabase.from("lesson_batches").select("lesson_id, batch_id"),
    ]);
    batchesData = bRes.data;
    lessonBatchesData = lbRes.data;

    const scopedLessonIds: string[] = [];
    lbRes.data?.forEach((lb) => {
      if (lb.batch_id === batchId) {
        scopedLessonIds.push(lb.lesson_id);
      }
    });

    if (scopedLessonIds.length > 0) {
      const { data: lData } = await supabase
        .from("lessons")
        .select("*")
        .in("id", scopedLessonIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      lessonsData = lData;
    } else {
      lessonsData = [];
    }
  }

  const batches: Batch[] = batchesData ?? [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  // Map lessonId -> array of Batch
  const lessonToBatchesMap = new Map<string, Batch[]>();

  lessonBatchesData?.forEach((lb) => {
    const b = batchMap.get(lb.batch_id);
    if (b) {
      const existing = lessonToBatchesMap.get(lb.lesson_id) || [];
      existing.push(b);
      lessonToBatchesMap.set(lb.lesson_id, existing);
    }
  });

  const lessons: Lesson[] = lessonsData ?? [];

  return (
    <div>
      <PageHeader
        title="Lessons"
        description="Organize, order, and assign video lectures to tuition batches."
        action={
          <Link
            href={
              batchId
                ? `/dashboard/lessons/new?batchId=${batchId}`
                : "/dashboard/lessons/new"
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>New Lesson</span>
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
              href="/dashboard/lessons"
              className={`rounded-full px-3 py-1 font-medium transition-colors shrink-0 ${
                !batchId
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All Batches
            </Link>

            {batches.map((b) => {
              const isActive = batchId === b.id;
              return (
                <Link
                  key={b.id}
                  href={`/dashboard/lessons?batchId=${b.id}`}
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

        {/* Lessons Grid or Empty State */}
        {lessons.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-4">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {batchId ? "No lessons assigned to this batch" : "No lessons created yet"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Add YouTube video links with descriptions and assign them to your student batches.
            </p>
            <div className="mt-6">
              <Link
                href={
                  batchId
                    ? `/dashboard/lessons/new?batchId=${batchId}`
                    : "/dashboard/lessons/new"
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                <span>Create First Lesson</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                batches={lessonToBatchesMap.get(lesson.id) ?? []}
                role="teacher"
                href={`/dashboard/lessons/${lesson.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
