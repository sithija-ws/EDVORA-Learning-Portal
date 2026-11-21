// app/(teacher)/dashboard/page.tsx
// Teacher dashboard — main overview with batch cards and quick actions.

import React from "react";
import Link from "next/link";
import { Plus, Users, BookOpen } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { BatchCard } from "@/components/batches/BatchCard";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Teacher Dashboard — Edvora",
};

export default async function TeacherDashboardPage() {
  const supabase = await createServerClient();

  // Fetch all batches
  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];

  // Fetch all enrollments to compute student counts per batch
  const { data: enrollmentsData } = await supabase
    .from("enrollments")
    .select("batch_id");

  const countMap: Record<string, number> = {};
  enrollmentsData?.forEach((e) => {
    countMap[e.batch_id] = (countMap[e.batch_id] || 0) + 1;
  });

  const batchesWithCount = batches.map((b) => ({
    ...b,
    student_count: countMap[b.id] || 0,
  }));

  const activeBatches = batches.filter((b) => !b.is_archived);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Manage your tuition batches, enrolled students, and class materials."
        action={
          <Link
            href="/dashboard/batches/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>New Batch</span>
          </Link>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Quick Summary Row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Users className="h-4 w-4 text-primary" />
              <span>Active Batches</span>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {activeBatches.length}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Users className="h-4 w-4 text-emerald-600" />
              <span>Total Enrollments</span>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {enrollmentsData?.length ?? 0}
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <span>All Batches</span>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {batches.length}
            </div>
          </div>
        </div>

        {/* Batches Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Your Batches
            </h2>
            <Link
              href="/dashboard/batches"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {batchesWithCount.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-4">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                No batches created yet
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Create your first tuition batch to start enrolling students and organizing lessons.
              </p>
              <div className="mt-6">
                <Link
                  href="/dashboard/batches/new"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create First Batch</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {batchesWithCount.map((batch) => (
                <BatchCard key={batch.id} batch={batch} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
