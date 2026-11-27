// app/(student)/home/lessons/page.tsx
// Student lessons directory — displays video lectures assigned to enrolled batches.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { LessonCard } from "@/components/lessons/LessonCard";
import type { Lesson, Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Lessons — Edvora",
};

interface StudentLessonsPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function StudentLessonsPage({
  searchParams,
}: StudentLessonsPageProps) {
  const { batchId } = await searchParams;
  const supabase = await createServerClient();

  // 1. Get current authenticated student
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch profile, enrolled batches, and tenant identities concurrently in parallel
  const [{ data: profile }, { data: enrollments }, { data: identities }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_active, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("batch_id, tenant_id")
      .eq("student_id", user.id),
    supabase
      .from("student_identities")
      .select("tenant_id")
      .eq("student_id", user.id),
  ]);

  if (!profile || !profile.is_active) {
    redirect("/disabled");
  }

  const enrolledBatchIds = enrollments?.map((e) => e.batch_id) ?? [];
  const studentTenantIds = Array.from(
    new Set([
      ...(identities?.map((i) => i.tenant_id) ?? []),
      ...((enrollments?.map((e) => e.tenant_id).filter(Boolean) as string[]) ?? []),
    ])
  );

  if (enrolledBatchIds.length === 0 || studentTenantIds.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader
          title="Lessons"
          description="Access your video lectures and class tutorials."
        />
        <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
          <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">
            Not enrolled in any batches yet
          </h3>
          <p className="mt-1 text-xs max-w-sm mx-auto">
            Your teacher has not enrolled you into a tuition batch yet. Please contact your instructor.
          </p>
        </div>
      </div>
    );
  }

  // 3. Shield student catalog for expired workspaces (SEC-3B2C-INFO-01)
  const { data: tenantSubs } = await supabase
    .from("tenant_subscriptions")
    .select("tenant_id, status, current_period_end, trial_ends_at")
    .in("tenant_id", studentTenantIds);

  const now = new Date();
  const activeTenantIds = new Set(
    tenantSubs
      ?.filter((sub) => {
        const isPeriodActive =
          sub.status === "active" &&
          sub.current_period_end &&
          new Date(sub.current_period_end) > now;
        const isTrialActive =
          sub.status === "trialing" &&
          sub.trial_ends_at &&
          new Date(sub.trial_ends_at) > now;
        return isPeriodActive || isTrialActive;
      })
      .map((sub) => sub.tenant_id) ?? []
  );

  if (activeTenantIds.size === 0) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <PageHeader
          title="Lessons"
          description="Access your video lectures and class tutorials."
        />
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-10 text-center text-foreground space-y-3">
          <BookOpen className="h-8 w-8 mx-auto text-destructive" />
          <h3 className="font-bold text-base text-foreground">
            Workspace Access Inactive
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Your tuition academy&apos;s trial or subscription is currently inactive. Lesson access is paused until your instructor renews their workspace subscription.
          </p>
        </div>
      </div>
    );
  }

  const authorizedTenantIds = Array.from(activeTenantIds);

  // Selected filter batch: must be one of enrolled batches if specified
  const effectiveBatchFilter =
    batchId && enrolledBatchIds.includes(batchId) ? batchId : null;

  // 4. Stage 2 concurrent fetch: enrolled batches and lesson assignments in parallel scoped to active tenants
  const [{ data: enrolledBatchesData }, { data: lessonBatchesData }] =
    await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .in("id", enrolledBatchIds)
        .in("tenant_id", authorizedTenantIds)
        .order("year", { ascending: false }),
      supabase
        .from("lesson_batches")
        .select("lesson_id, batch_id")
        .in(
          "batch_id",
          effectiveBatchFilter ? [effectiveBatchFilter] : enrolledBatchIds
        )
        .in("tenant_id", authorizedTenantIds),
    ]);

  const enrolledBatches: Batch[] = enrolledBatchesData ?? [];
  const batchMap = new Map(enrolledBatches.map((b) => [b.id, b]));

  const lessonToBatchesMap = new Map<string, Batch[]>();
  const lessonIdSet = new Set<string>();

  lessonBatchesData?.forEach((lb) => {
    lessonIdSet.add(lb.lesson_id);
    const b = batchMap.get(lb.batch_id);
    if (b) {
      const existing = lessonToBatchesMap.get(lb.lesson_id) || [];
      existing.push(b);
      lessonToBatchesMap.set(lb.lesson_id, existing);
    }
  });

  const lessonIds = Array.from(lessonIdSet);
  let lessons: Lesson[] = [];

  if (lessonIds.length > 0) {
    const { data: lessonsData } = await supabase
      .from("lessons")
      .select("*")
      .in("id", lessonIds)
      .in("tenant_id", authorizedTenantIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    lessons = lessonsData ?? [];
  }

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-6 pb-0">
        <PageHeader
          title="Lessons"
          description="Video tutorials and lecture sessions for your tuition batches."
        />

        {/* Multi-batch filter tabs if student has > 1 batch */}
        {enrolledBatches.length > 1 && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <Link
              href="/home/lessons"
              className={`rounded-full px-3 py-1 font-medium transition-colors shrink-0 ${
                !effectiveBatchFilter
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All My Batches
            </Link>

            {enrolledBatches.map((b) => {
              const isActive = effectiveBatchFilter === b.id;
              return (
                <Link
                  key={b.id}
                  href={`/home/lessons?batchId=${b.id}`}
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
      </div>

      <div className="p-4 sm:p-6 pt-2">
        {lessons.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-sm">
              No lessons published yet
            </h3>
            <p className="mt-1 text-xs max-w-sm mx-auto">
              Your teacher has not uploaded any video lessons for this batch yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                batches={lessonToBatchesMap.get(lesson.id) ?? []}
                role="student"
                href={`/home/lessons/${lesson.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
