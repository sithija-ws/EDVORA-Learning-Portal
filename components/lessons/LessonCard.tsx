// components/lessons/LessonCard.tsx
// Responsive lesson card — cinematic thumbnail with play overlay and clear affordance.

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LessonDeleteButton } from "./LessonDeleteButton";
import { Play, Edit, ArrowRight } from "lucide-react";
import type { Lesson, Batch } from "@/types";

interface LessonCardProps {
  lesson: Lesson;
  batches?: Batch[];
  role: "teacher" | "student";
  href: string;
  showActions?: boolean;
}

export function LessonCard({
  lesson,
  batches = [],
  role,
  href,
  showActions = true,
}: LessonCardProps) {
  const [imageError, setImageError] = useState(false);
  const fallbackThumbnail = `https://img.youtube.com/vi/${lesson.youtube_id}/hqdefault.jpg`;
  const thumbnailUrl =
    imageError || !lesson.thumbnail_url ? fallbackThumbnail : lesson.thumbnail_url;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md">
      {/* Thumbnail — 16:9 */}
      <Link href={href} className="relative block aspect-video w-full overflow-hidden bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={lesson.title}
          loading="lazy"
          onError={() => setImageError(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent opacity-80 transition-opacity group-hover:opacity-95" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300 group-hover:scale-110">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Sort order badge */}
        {lesson.sort_order > 0 && (
          <div className="absolute bottom-2 left-2 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
            UNIT #{lesson.sort_order}
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Batch badges */}
        {batches.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {batches.map((b) => (
              <Badge
                key={b.id}
                variant="outline"
                className="text-[10px] font-mono font-bold uppercase tracking-wider border-primary/30 text-primary bg-primary/5"
              >
                {b.name}
              </Badge>
            ))}
          </div>
        )}

        <h3 className="flex-1 text-sm font-black tracking-tight text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {lesson.title}
        </h3>

        {lesson.description && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {lesson.description}
          </p>
        )}

        {/* Student action link */}
        {role === "student" && (
          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
            <span className="font-semibold text-primary group-hover:underline flex items-center gap-1">
              Watch Lecture <ArrowRight className="h-3 w-3" />
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">HD Video</span>
          </div>
        )}

        {/* Teacher actions */}
        {role === "teacher" && showActions && (
          <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
            <Link
              href={`${href}/edit`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </Link>
            <LessonDeleteButton lessonId={lesson.id} lessonTitle={lesson.title} />
          </div>
        )}
      </div>
    </div>
  );
}
