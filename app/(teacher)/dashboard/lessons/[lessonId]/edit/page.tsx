// app/(teacher)/dashboard/lessons/[lessonId]/edit/page.tsx
// Page to edit an existing lesson's details, YouTube URL, and batch assignments.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { LessonForm } from "@/components/lessons/LessonForm";
import type { Lesson, Batch } from "@/types";

export const instant = false;

interface EditLessonPageProps {
  params: Promise<{ lessonId: string }>;
}

export async function generateMetadata({ params }: EditLessonPageProps) {
  const { lessonId } = await params;
  const supabase = await createServerClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("title")
    .eq("id", lessonId)
    .single();

  return {
    title: lesson ? `Edit ${lesson.title} — Edvora` : "Edit Lesson — Edvora",
  };
}

export default async function EditLessonPage({
  params,
}: EditLessonPageProps) {
  const { lessonId } = await params;
  const supabase = await createServerClient();

  // 1. Fetch lesson
  const { data: lessonData } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();

  if (!lessonData) {
    notFound();
  }

  const lesson: Lesson = lessonData;

  // 2. Fetch current batch assignments
  const { data: lessonBatches } = await supabase
    .from("lesson_batches")
    .select("batch_id")
    .eq("lesson_id", lessonId);

  const currentBatchIds = lessonBatches?.map((lb) => lb.batch_id) ?? [];

  // 3. Fetch all batches
  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];

  return (
    <div>
      <PageHeader
        title={`Edit: ${lesson.title}`}
        description="Update lesson details, video link, or assigned batches."
        backHref={`/dashboard/lessons/${lesson.id}`}
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <LessonForm
            lesson={{
              ...lesson,
              batch_ids: currentBatchIds,
            }}
            batches={batches}
          />
        </div>
      </div>
    </div>
  );
}
