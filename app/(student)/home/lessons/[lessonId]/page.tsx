// app/(student)/home/lessons/[lessonId]/page.tsx
// Student lesson video player and study page with strict batch isolation.

import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { VideoPlayer } from "@/components/lessons/VideoPlayer";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, ArrowLeft } from "lucide-react";
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
    title: lesson ? `${lesson.title} — Edvora` : "Watch Lesson — Edvora",
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
    // Student is not enrolled in any batch assigned to this lesson
    notFound();
  }

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

  // 6. Fetch batch name for context
  const { data: batchData } = await supabase
    .from("batches")
    .select("name, year")
    .eq("id", matchingJunction[0].batch_id)
    .single();

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          href="/home/lessons"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to lessons</span>
        </Link>
      </div>

      {/* Video Player */}
      <VideoPlayer youtubeId={lesson.youtube_id} title={lesson.title} />

      {/* Lesson Details */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {batchData && (
            <Badge variant="secondary" className="text-xs">
              {batchData.name} ({batchData.year} A/L)
            </Badge>
          )}
          {lesson.sort_order > 0 && (
            <Badge variant="outline" className="text-xs">
              Lesson #{lesson.sort_order}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(lesson.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {lesson.title}
        </h1>

        {/* Study Notes / Description */}
        <div className="rounded-xl border bg-card p-4 sm:p-5 mt-4 space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-primary" />
            <span>Study Notes & Lesson Details</span>
          </h2>
          {lesson.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground pt-1">
              {lesson.description}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              No additional notes provided for this lesson.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
