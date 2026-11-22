// app/(student)/home/page.tsx
// Student portal home — enrolled batch header + recent lessons feed.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Bell, Play, ArrowRight, Video, Pin } from "lucide-react";
import type { Lesson, Batch, Announcement } from "@/types";

export const instant = false;

export const metadata = {
  title: "Student Portal — Edvora",
};

export default async function StudentHomePage() {
  const supabase = await createServerClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch profile to ensure active student
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_active, role")
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

  let batches: Batch[] = [];
  if (enrolledBatchIds.length > 0) {
    const { data: batchesData } = await supabase
      .from("batches")
      .select("*")
      .in("id", enrolledBatchIds)
      .order("year", { ascending: false });

    batches = batchesData ?? [];
  }

  // 4. Fetch recent lessons assigned to student's batches
  let recentLessons: Lesson[] = [];

  if (enrolledBatchIds.length > 0) {
    const { data: lessonBatches } = await supabase
      .from("lesson_batches")
      .select("lesson_id")
      .in("batch_id", enrolledBatchIds);

    const lessonIds = Array.from(new Set(lessonBatches?.map((lb) => lb.lesson_id) ?? []));

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

  // 5. Fetch recent announcements for student's batches or broadcast
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

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Welcome & Batch Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Enrolled In:
          </span>
          {batches.length > 0 ? (
            batches.map((b) => (
              <Badge key={b.id} variant="secondary" className="text-xs">
                {b.name} ({b.year} A/L)
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              No active batches
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome, {profile.full_name}
        </h1>
        <p className="text-xs text-muted-foreground">
          Engineering Technology Tuition Portal — Access your lessons and study materials below.
        </p>
      </div>

      {/* Quick Access Grid */}
      <div className="grid gap-6">
        {/* Recent Lessons Section */}
        <section className="rounded-2xl border bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <BookOpen className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Recent Lessons
                </h2>
                <p className="text-xs text-muted-foreground">
                  Latest video lectures for your batches
                </p>
              </div>
            </div>

            <Link
              href="/home/lessons"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentLessons.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-muted-foreground">
              <Video className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-xs font-medium text-foreground">
                No lessons available yet
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                New video units will appear here as soon as your teacher publishes them.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentLessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/home/lessons/${lesson.id}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border p-3 hover:bg-muted/50 hover:border-primary/40 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          lesson.thumbnail_url ||
                          `https://img.youtube.com/vi/${lesson.youtube_id}/hqdefault.jpg`
                        }
                        alt={lesson.title}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                        <Play className="h-4 w-4 fill-white text-white ml-0.5" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {lesson.title}
                      </h3>
                      {lesson.description && (
                        <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                          {lesson.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 text-xs font-semibold text-primary flex items-center gap-1">
                    Watch <Play className="h-3 w-3 fill-current" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Announcements Section */}
        <section className="rounded-2xl border bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Class Notices & Announcements
                </h2>
                <p className="text-xs text-muted-foreground">
                  Important updates from your instructor
                </p>
              </div>
            </div>

            <Link
              href="/home/announcements"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentAnnouncements.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-xs text-muted-foreground">
              <p className="font-medium text-foreground">No notices posted yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Check back regularly for holiday updates, schedule adjustments, and homework notices.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAnnouncements.map((ann) => (
                <div
                  key={ann.id}
                  className={`rounded-xl border p-4 space-y-2 transition-all ${
                    ann.is_pinned
                      ? "border-amber-300 bg-amber-50/30"
                      : "bg-muted/10 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
                      {ann.is_pinned && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 font-medium">
                          <Pin className="h-3 w-3 fill-amber-700 text-amber-700" />
                          Pinned
                        </span>
                      )}
                      <span>{ann.title}</span>
                    </div>

                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(ann.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {ann.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
