// app/(student)/home/lessons/[lessonId]/page.tsx
// High-focus student lesson watch console with study notes and sequential lesson navigation.

import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { VideoPlayer } from "@/components/lessons/VideoPlayer";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Calendar,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Lesson } from "@/types";

export const instant = false;

interface StudentLessonWatchPageProps {
  params: Promise<{ lessonId: string }>;
}

export async function generateMetadata({ params }: StudentLessonWatchPageProps) {
  const { lessonId } = await params;
  const supabase = await createServerClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("title")
    .eq("id", lessonId)
    .single();

  return {
    title: lesson ? `${lesson.title} – Edvora` : "Watch Lesson – Edvora",
  };
}

export default async function StudentLessonWatchPage({
  params,
}: StudentLessonWatchPageProps) {
  const { lessonId } = await params;
  const supabase = await createServerClient();

  // 1. Authenticate student
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Verify active status
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    redirect("/disabled");
  }

  // 3. Fetch student's enrolled batches
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("batch_id")
    .eq("student_id", user.id);

  const enrolledBatchIds = enrollments?.map((e) => e.batch_id) ?? [];

  if (enrolledBatchIds.length === 0) {
    notFound();
  }

  // 4. Verify batch authorization: Lesson must belong to at least one enrolled batch
  const { data: matchingJunction } = await supabase
    .from("lesson_batches")
    .select("batch_id")
    .eq("lesson_id", lessonId)
    .in("batch_id", enrolledBatchIds);

  if (!matchingJunction || matchingJunction.length === 0) {
    notFound();
  }

  const currentBatchId = matchingJunction[0].batch_id;

  // 5. Fetch lesson details
  const { data: lessonData } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();

  if (!lessonData) {
    notFound();
  }

  const lesson: Lesson = lessonData;

  // 6. Fetch batch info
  const { data: batchData } = await supabase
    .from("batches")
    .select("name, year")
    .eq("id", currentBatchId)
    .single();

  // 7. Fetch sibling lessons in the same batch for continuous playlist navigation
  const { data: batchJunctions } = await supabase
    .from("lesson_batches")
    .select("lesson_id")
    .eq("batch_id", currentBatchId);

  const siblingIds = batchJunctions?.map((bj) => bj.lesson_id) ?? [];

  let prevLesson: { id: string; title: string } | null = null;
  let nextLesson: { id: string; title: string } | null = null;

  if (siblingIds.length > 0) {
    const { data: siblings } = await supabase
      .from("lessons")
      .select("id, title, sort_order, created_at")
      .in("id", siblingIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    const siblingList = siblings ?? [];
    const currentIndex = siblingList.findIndex((s) => s.id === lessonId);

    if (currentIndex > 0) {
      prevLesson = siblingList[currentIndex - 1];
    }
    if (currentIndex >= 0 && currentIndex < siblingList.length - 1) {
      nextLesson = siblingList[currentIndex + 1];
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24 sm:pb-12 max-w-4xl mx-auto">
      {/* ── Navigation Breadcrumb Bar ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <Link
          href="/home/lessons"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>All Lessons</span>
        </Link>

        {batchData && (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/5 font-mono text-[10px] font-bold text-primary"
          >
            {batchData.name} ({batchData.year} A/L)
          </Badge>
        )}
      </div>

      {/* ── Cinematic Video Player ───────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border shadow-lg shadow-black/5 bg-zinc-950">
        <VideoPlayer youtubeId={lesson.youtube_id} title={lesson.title} />
      </div>

      {/* ── Lesson Title & Telemetry ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {lesson.sort_order > 0 && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                UNIT #{lesson.sort_order}
              </span>
            )}

            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto font-mono text-[11px]">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {new Date(lesson.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground leading-snug">
            {lesson.title}
          </h1>
        </div>

        {/* ── Addictive Sequential Playlist Bar ─────────────────────── */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 p-2.5">
          {prevLesson ? (
            <Link
              href={`/home/lessons/${prevLesson.id}`}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-card hover:text-foreground transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline truncate max-w-[150px]">
                {prevLesson.title}
              </span>
              <span className="sm:hidden">Previous</span>
            </Link>
          ) : (
            <div className="text-xs text-muted-foreground/40 px-2.5 py-1.5 font-mono text-[10px]">
              First Lesson
            </div>
          )}

          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            Course Playlist
          </div>

          {nextLesson ? (
            <Link
              href={`/home/lessons/${nextLesson.id}`}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95"
            >
              <span className="hidden sm:inline truncate max-w-[150px]">
                {nextLesson.title}
              </span>
              <span className="sm:hidden">Next Lesson</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <div className="text-xs text-muted-foreground/40 px-2.5 py-1.5 font-mono text-[10px]">
              Latest Lesson
            </div>
          )}
        </div>

        {/* ── Study Notes Box ──────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Study Notes & Reference Materials
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Official notes and instructions from your instructor
              </p>
            </div>
          </div>

          {lesson.description ? (
            <div className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-muted-foreground pt-1">
              {lesson.description}
            </div>
          ) : (
            <div className="py-4 text-center text-xs italic text-muted-foreground">
              No supplementary notes attached to this lesson. Focus on the lecture video.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
