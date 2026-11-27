// app/(teacher)/dashboard/page.tsx
// Teacher dashboard — main overview with batch cards and quick actions.
// Warm editorial design, 60-30-10 amber-stone palette.

import React from "react";
import Link from "next/link";
import { Plus, Users, BookOpen, Megaphone, FileText } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/auth/tenant";
import { BatchCard } from "@/components/batches/BatchCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import type { Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Dashboard – Edvora",
};

export default async function TeacherDashboardPage() {
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  // Fetch batches and all enrollments concurrently in a single parallel roundtrip scoped to active tenant
  const [{ data: batchesData }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from("batches")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .order("year", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("enrollments")
      .select("batch_id")
      .eq("tenant_id", tenant.tenantId),
  ]);

  const batches: Batch[] = batchesData ?? [];

  const countMap: Record<string, number> = {};
  enrollmentsData?.forEach((e) => {
    countMap[e.batch_id] = (countMap[e.batch_id] || 0) + 1;
  });

  const batchesWithCount = batches.map((b) => ({
    ...b,
    student_count: countMap[b.id] || 0,
  }));

  const activeBatches = batches.filter((b) => !b.is_archived);
  const totalStudents = enrollmentsData?.length ?? 0;

  const STATS = [
    {
      label: "Active Batches",
      value: activeBatches.length,
      icon: Users,
    },
    {
      label: "Total Students",
      value: totalStudents,
      icon: BookOpen,
    },
    {
      label: "All Batches",
      value: batches.length,
      icon: Megaphone,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Manage your tuition batches, enrolled students, and class materials."
        action={
          <Link
            href="/dashboard/batches/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            New Batch
          </Link>
        }
      />

      <div className="p-4 sm:p-6 space-y-8">
        <TrialBanner
          isTrial={tenant.isTrial}
          trialEndsAt={tenant.trialEndsAt}
          trialRemainingSeconds={tenant.trialRemainingSeconds}
          isSubscriptionActive={tenant.isSubscriptionActive}
          subscriptionStatus={tenant.subscriptionStatus}
        />

        {/* ── Stats Row ───────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {STATS.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-wide hidden sm:inline">
                  {label}
                </span>
              </div>
              <div className="text-3xl font-black tracking-tight text-foreground">
                {value}
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground sm:hidden">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Quick Actions ────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/lessons/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Add Lesson
          </Link>
          <Link
            href="/dashboard/notes/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <FileText className="h-3.5 w-3.5" />
            Upload PDF Note
          </Link>
          <Link
            href="/dashboard/announcements/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Megaphone className="h-3.5 w-3.5" />
            Post Notice
          </Link>
        </div>

        {/* ── Batches Grid ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black tracking-tight text-foreground">
              Your Batches
            </h2>
            <Link
              href="/dashboard/batches"
              className="text-xs font-bold text-primary hover:underline"
            >
              View all →
            </Link>
          </div>

          {batchesWithCount.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Users className="h-7 w-7" />
              </div>
              <h3 className="text-base font-black text-foreground">
                No batches yet
              </h3>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Create your first tuition batch to start enrolling students and
                organizing lessons.
              </p>
              <div className="mt-6">
                <Link
                  href="/dashboard/batches/new"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Create First Batch
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
