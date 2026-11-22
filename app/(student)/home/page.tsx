// app/(student)/home/page.tsx
// Student portal home — enrolled batch header + recent lessons and notices.
// Mobile-first. Warm editorial design. pb-20 for bottom nav clearance.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Bell, Play, ArrowRight, Video, Pin } from "lucide-react";
import type { Lesson, Batch, Announcement } from "@/types";

export const instant = false;

export const metadata = {
  title: "Home – Edvora",
};

export default async function StudentHomePage() {
  const supabase = await createServerClient();

  // 1. Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_active, role")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) redirect("/disabled");

  // 3. Enrolled batches
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("batch_id")
    .eq("student_id", user.id);

  const enrolledBatchIds = enrollments?.map((e) => e.batch_id) ?? [];

  let batches: Batch[] = [];
  if (enrolledBatchIds.length > 0) {
    const { data: batchesData } = await supabase
      .from("batches")
      .select("*")
      .in("id", enrolledBatchIds)
      .order("year", { ascending: false });
    batches = batchesData ?? [];
  }

  // 4. Recent lessons
  let recentLessons: Lesson[] = [];
  if (enrolledBatchIds.length > 0) {
    const { data: lessonBatches } = await supabase
      .from("lesson_batches")
      .select("lesson_id")
      .in("batch_id", enrolledBatchIds);

    const lessonIds = Array.from(
      new Set(lessonBatches?.map((lb) => lb.lesson_id) ?? [])
    );

    if (lessonIds.length > 0) {
      const { data: lessonsData } = await supabase
        .from("lessons")
        .select("*")
        .in("id", lessonIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(3);
      recentLessons = lessonsData ?? [];
    }
  }

  // 5. Recent announcements
  let recentAnnouncements: Announcement[] = [];
  if (enrolledBatchIds.length > 0) {
    const { data: annBatches } = await supabase
      .from("announcement_batches")
      .select("announcement_id")
      .in("batch_id", enrolledBatchIds);

    const scopedAnnIds = annBatches?.map((ab) => ab.announcement_id) ?? [];

    const { data: annData } = await supabase
      .from("announcements")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    const allNotices = annData ?? [];
    recentAnnouncements = allNotices
      .filter((a) => a.is_broadcast || scopedAnnIds.includes(a.id))
      .slice(0, 3);
  }

  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── Welcome Hero ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-background to-background p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {batches.length > 0 ? (
            batches.map((b) => (
              <Badge
                key={b.id}
                variant="outline"
                className="border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wide"
              >
                {b.name} · {b.year} A/L
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              No active batch
            </Badge>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Hello, {firstName} 👋
          </h1>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Engineering Technology Tuition · Access your lessons and study
            materials below.
          </p>
        </div>

        {/* Quick nav pills */}
        <div className="flex gap-2 pt-1">
          <Link
            href="/home/lessons"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Lessons
          </Link>
          <Link
            href="/home/announcements"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5 active:scale-95"
          >
            <Bell className="h-3.5 w-3.5" />
            Notices
          </Link>
        </div>
      </div>

      {/* ── Recent Lessons ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-black tracking-tight text-foreground">
              Recent Lessons
            </h2>
          </div>
          <Link
            href="/home/lessons"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentLessons.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <Video className="mx-auto h-7 w-7 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-semibold text-foreground">No lessons yet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              New video units will appear here once your teacher publishes them.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/home/lessons/${lesson.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.99]"
              >
                {/* Thumbnail */}
                <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      lesson.thumbnail_url ||
                      `https://img.youtube.com/vi/${lesson.youtube_id}/hqdefault.jpg`
                    }
                    alt={lesson.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/15 transition-colors">
                    <Play className="h-4 w-4 fill-white text-white ml-0.5" />
                  </div>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-black text-foreground group-hover:text-primary transition-colors leading-tight">
                    {lesson.title}
                  </h3>
                  {lesson.description && (
                    <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                      {lesson.description}
                    </p>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent Announcements ──────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-black tracking-tight text-foreground">
              Class Notices
            </h2>
          </div>
          <Link
            href="/home/announcements"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentAnnouncements.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <Bell className="mx-auto h-7 w-7 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-semibold text-foreground">No notices yet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Check back for holiday updates, schedule changes, and homework.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentAnnouncements.map((ann) => (
              <div
                key={ann.id}
                className={`relative overflow-hidden rounded-xl border p-4 space-y-2 ${
                  ann.is_pinned
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                {ann.is_pinned && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-primary rounded-l-xl" />
                )}
                <div className="flex items-start justify-between gap-2 pl-1">
                  <div className="flex flex-col gap-1 min-w-0">
                    {ann.is_pinned && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        <Pin className="h-2.5 w-2.5 fill-current" />
                        Pinned
                      </span>
                    )}
                    <h3 className="text-xs font-black text-foreground leading-snug">
                      {ann.title}
                    </h3>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    {new Date(ann.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap pl-1 line-clamp-3">
                  {ann.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
