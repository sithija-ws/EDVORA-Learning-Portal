// app/(teacher)/dashboard/lessons/[lessonId]/page.tsx
// Teacher preview and management page for an individual lesson.

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { VideoPlayer } from "@/components/lessons/VideoPlayer";
import { LessonDeleteButton } from "@/components/lessons/LessonDeleteButton";
import { Badge } from "@/components/ui/badge";
import { Edit, ExternalLink, Layers } from "lucide-react";
import type { Lesson, Batch } from "@/types";

export const instant = false;

interface LessonDetailPageProps {
  params: Promise<{ lessonId: string }>;
}

export async function generateMetadata({ params }: LessonDetailPageProps) {
  const { lessonId } = await params;
  const supabase = await createServerClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("title")
    .eq("id", lessonId)
    .single();

  return {
    title: lesson ? `${lesson.title} — Edvora` : "Lesson — Edvora",
  };
}

export default async function TeacherLessonDetailPage({
  params,
}: LessonDetailPageProps) {
  const { lessonId } = await params;
  const supabase = await createServerClient();

  // 1. Fetch lesson details
  const { data: lessonData } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();

  if (!lessonData) {
    notFound();
  }

  const lesson: Lesson = lessonData;

  // 2. Fetch assigned batches
  const { data: lessonBatches } = await supabase
    .from("lesson_batches")
    .select("batch_id")
    .eq("lesson_id", lessonId);

  const batchIds = lessonBatches?.map((lb) => lb.batch_id) ?? [];
  let assignedBatches: Batch[] = [];

  if (batchIds.length > 0) {
    const { data: batches } = await supabase
      .from("batches")
      .select("*")
      .in("id", batchIds)
      .order("name", { ascending: true });

    assignedBatches = batches ?? [];
  }

  return (
    <div>
      <PageHeader
        title={lesson.title}
        description={`Order #${lesson.sort_order} · Published on ${new Date(
          lesson.created_at
        ).toLocaleDateString()}`}
        backHref="/dashboard/lessons"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/lessons/${lesson.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-semibold hover:bg-muted transition-colors"
            >
              <Edit className="h-4 w-4" />
              <span>Edit</span>
            </Link>
            <LessonDeleteButton
              lessonId={lesson.id}
              lessonTitle={lesson.title}
              redirectTo="/dashboard/lessons"
            />
          </div>
        }
      />

      <div className="p-4 sm:p-6 max-w-5xl space-y-6">
        {/* Video Player */}
        <VideoPlayer youtubeId={lesson.youtube_id} title={lesson.title} />

        {/* Content Details Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Description */}
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                Lesson Overview & Notes
              </h2>
              {lesson.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {lesson.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No notes or description provided for this lesson.
                </p>
              )}
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-4">
            {/* Assigned Batches */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Assigned Batches ({assignedBatches.length})
                </h3>
              </div>
              <div className="space-y-2">
                {assignedBatches.map((b) => (
                  <Link
                    key={b.id}
                    href={`/dashboard/batches/${b.id}`}
                    className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 transition-colors text-xs"
                  >
                    <span className="font-medium text-foreground">{b.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {b.year} A/L
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>

            {/* Video Link */}
            <div className="rounded-xl border bg-card p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-foreground">
                Video Information
              </h3>
              <div className="space-y-1.5 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">YouTube ID:</span>{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                    {lesson.youtube_id}
                  </code>
                </div>
                <div>
                  <span className="font-medium text-foreground">Sort Index:</span>{" "}
                  {lesson.sort_order}
                </div>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${lesson.youtube_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <span>Open in YouTube</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
