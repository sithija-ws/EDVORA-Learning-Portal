// app/(student)/home/page.tsx
// High-engagement student learning console — hero lesson spotlight, telemetry strip, and class bulletins.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Bell,
  Play,
  ArrowRight,
  Video,
  Pin,
  Sparkles,
  GraduationCap,
  Clock,
} from "lucide-react";
import type { Lesson, Batch, Announcement } from "@/types";

export const instant = false;

export const metadata = {
  title: "Learning Portal – Edvora",
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

  // 4. Fetch lessons assigned to enrolled batches
  let lessons: Lesson[] = [];
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
        .limit(6);
      lessons = lessonsData ?? [];
    }
  }

  // 5. Fetch announcements
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
  const featuredLesson = lessons[0];
  const secondaryLessons = lessons.slice(1);

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24 sm:pb-12 max-w-4xl mx-auto">
      {/* ── 1. Telemetry & Welcome Banner ─────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        {/* Subtle engineering grid accent */}
        <div className="pointer-events-none absolute inset-0 bg-tech-grid opacity-30" />

        <div className="relative space-y-4">
          {/* Top Status Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Enrollment Active
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {batches.length > 0 ? (
                batches.map((b) => (
                  <Badge
                    key={b.id}
                    variant="outline"
                    className="border-primary/40 bg-primary/5 font-mono text-[10px] font-bold text-primary"
                  >
                    {b.name} · {b.year} A/L
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Awaiting Batch Assignment
                </Badge>
              )}
            </div>
          </div>

          {/* Greeting Hero */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Welcome back, {firstName}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Engineering Technology Tuition Portal · Ready for your study session?
              </p>
            </div>

            {/* Quick Metrics Chips */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2 text-xs">
                <Video className="h-4 w-4 text-primary" />
                <div>
                  <div className="font-mono font-black text-foreground">
                    {lessons.length}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    Lectures
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2 text-xs">
                <Bell className="h-4 w-4 text-primary" />
                <div>
                  <div className="font-mono font-black text-foreground">
                    {recentAnnouncements.length}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    Notices
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Featured Spotlight Lesson (Dopamine Trigger) ──────── */}
      {featuredLesson && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
                Next Up for Study
              </h2>
            </div>
            <Link
              href="/home/lessons"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span>All Lectures</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-primary/40 bg-card shadow-md transition-all hover:border-primary hover:shadow-lg">
            {/* Top Amber Status Bar */}
            <div className="h-1 w-full bg-gradient-to-r from-primary via-amber-500 to-primary" />

            <div className="grid sm:grid-cols-5 gap-0">
              {/* Cinematic Thumbnail Preview (2 cols) */}
              <Link
                href={`/home/lessons/${featuredLesson.id}`}
                className="relative sm:col-span-2 aspect-video overflow-hidden bg-zinc-950 block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    featuredLesson.thumbnail_url ||
                    `https://img.youtube.com/vi/${featuredLesson.youtube_id}/hqdefault.jpg`
                  }
                  alt={featuredLesson.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Pulsing Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-all duration-300 group-hover:scale-110">
                    <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-25" />
                    <Play className="h-6 w-6 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Lesson Index Pill */}
                {featuredLesson.sort_order > 0 && (
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-mono font-bold text-white backdrop-blur-sm">
                    UNIT #{featuredLesson.sort_order}
                  </div>
                )}
              </Link>

              {/* Lesson Details & Call-To-Action (3 cols) */}
              <div className="sm:col-span-3 p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
                      Featured Lesson
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Ready to watch
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black tracking-tight text-foreground leading-snug group-hover:text-primary transition-colors">
                    {featuredLesson.title}
                  </h3>

                  {featuredLesson.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {featuredLesson.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-border/60">
                  <Link
                    href={`/home/lessons/${featuredLesson.id}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-95"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Watch Lesson Now</span>
                  </Link>

                  <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">
                    HD Video with Study Notes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. More Lessons Shelf ─────────────────────────────────── */}
      {secondaryLessons.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
                More Lectures for Your Batch
              </h2>
            </div>
            <Link
              href="/home/lessons"
              className="text-xs font-bold text-primary hover:underline"
            >
              View All ({lessons.length}) →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {secondaryLessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/home/lessons/${lesson.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.99]"
              >
                {/* Mini Thumbnail */}
                <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      lesson.thumbnail_url ||
                      `https://img.youtube.com/vi/${lesson.youtube_id}/hqdefault.jpg`
                    }
                    alt={lesson.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                    <Play className="h-4 w-4 fill-white text-white ml-0.5" />
                  </div>
                  {lesson.sort_order > 0 && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 text-[9px] font-mono text-white">
                      #{lesson.sort_order}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-black text-foreground group-hover:text-primary transition-colors leading-tight">
                    {lesson.title}
                  </h4>
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
        </section>
      )}

      {/* ── 4. Empty State if no lessons exist ─────────────────────── */}
      {lessons.length === 0 && (
        <section className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <GraduationCap className="mx-auto h-9 w-9 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-bold text-foreground">
            No lessons uploaded yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Your instructor will publish video tutorials and lesson materials soon. Check back shortly!
          </p>
        </section>
      )}

      {/* ── 5. Class Bulletins & Announcements Feed ─────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
              Class Bulletins & Notices
            </h2>
          </div>
          <Link
            href="/home/announcements"
            className="text-xs font-bold text-primary hover:underline"
          >
            All Notices →
          </Link>
        </div>

        {recentAnnouncements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">No recent announcements</p>
            <p className="text-[11px] mt-0.5">
              Check back for schedule adjustments, exam tips, and homework assignments.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentAnnouncements.map((ann) => (
              <div
                key={ann.id}
                className={`relative overflow-hidden rounded-xl border p-4 transition-all ${
                  ann.is_pinned
                    ? "border-primary/40 bg-primary/5 shadow-xs"
                    : "border-border bg-card hover:border-primary/20"
                }`}
              >
                {ann.is_pinned && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
                )}

                <div className="flex items-start justify-between gap-3 pl-1">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ann.is_pinned && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
                          <Pin className="h-2.5 w-2.5 fill-current" />
                          Pinned Dispatch
                        </span>
                      )}
                      {ann.is_broadcast && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                          All Batches
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-black text-foreground leading-snug">
                      {ann.title}
                    </h3>
                  </div>

                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {new Date(ann.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap pl-1 line-clamp-3">
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
