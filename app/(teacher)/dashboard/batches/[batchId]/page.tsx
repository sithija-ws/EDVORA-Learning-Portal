// app/(teacher)/dashboard/batches/[batchId]/page.tsx
// Batch detail page with enrolled students list and content sections.

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentTable } from "@/components/students/StudentTable";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Users, BookOpen, Bell, Archive } from "lucide-react";
import type { Profile } from "@/types";

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

        {/* Milestone 3 & 4 Preview Sections */}
        <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t">
          {/* Lessons Section */}
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-500" />
              <h3 className="text-base font-semibold text-foreground">
                Lessons
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Assign unlisted YouTube video lessons to this batch.
            </p>
            <div className="rounded-lg bg-muted/40 p-4 text-center text-xs text-muted-foreground">
              Lessons management will be implemented in Milestone 3.
            </div>
          </section>

          {/* Announcements Section */}
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold text-foreground">
                Announcements
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Publish text notices specifically to this batch.
            </p>
            <div className="rounded-lg bg-muted/40 p-4 text-center text-xs text-muted-foreground">
              Announcements will be implemented in Milestone 4.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
