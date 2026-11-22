// app/(teacher)/dashboard/lessons/new/page.tsx
// Page to create a new lesson unit and assign it to batches.

import React from "react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { LessonForm } from "@/components/lessons/LessonForm";
import type { Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Create Lesson — Edvora",
};

interface NewLessonPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function NewLessonPage({
  searchParams,
}: NewLessonPageProps) {
  const { batchId } = await searchParams;
  const supabase = await createServerClient();

  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];

  const preSelectedBatch = batches.find((b) => b.id === batchId);

  return (
    <div>
      <PageHeader
        title="Create New Lesson"
        description={
          preSelectedBatch
            ? `Publish a new lesson unit for ${preSelectedBatch.name}.`
            : "Publish a new lesson unit and assign it to student batches."
        }
        backHref={
          batchId
            ? `/dashboard/batches/${batchId}`
            : "/dashboard/lessons"
        }
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <LessonForm
            batches={batches}
            preSelectedBatchId={batchId}
          />
        </div>
      </div>
    </div>
  );
}
