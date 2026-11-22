// components/lessons/LessonCard.tsx
// Responsive card component for a lesson unit in teacher and student views.

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LessonDeleteButton } from "./LessonDeleteButton";
import { Play, Edit } from "lucide-react";
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
  const thumbnailUrl = imageError || !lesson.thumbnail_url ? fallbackThumbnail : lesson.thumbnail_url;

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs transition-all hover:shadow-md hover:border-primary/40">
      {/* Thumbnail with 16:9 ratio */}
      <Link href={href} className="relative aspect-video w-full overflow-hidden bg-neutral-900 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={lesson.title}
          loading="lazy"
          onError={() => setImageError(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Play Icon Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-80 group-hover:opacity-100 group-hover:bg-black/40 transition-all">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/95 text-primary-foreground shadow-md transition-transform group-hover:scale-110">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Sort order tag if > 0 */}
        {lesson.sort_order > 0 && (
          <div className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
            #{lesson.sort_order}
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Batch Badges */}
        {batches.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {batches.map((b) => (
              <Badge
                key={b.id}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 font-normal"
              >
                {b.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Title */}
        <Link href={href} className="focus:outline-hidden">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {lesson.title}
          </h3>
        </Link>

        {/* Description snippet */}
        {lesson.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {lesson.description}
          </p>
        )}

        {/* Bottom footer / actions */}
        <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/50 text-xs text-muted-foreground">
          <span className="text-[11px]">
            {new Date(lesson.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>

          {role === "teacher" && showActions && (
            <div className="flex items-center gap-1">
              <Link
                href={`/dashboard/lessons/${lesson.id}/edit`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Edit Lesson"
              >
                <Edit className="h-4 w-4" />
                <span className="sr-only">Edit</span>
              </Link>
              <LessonDeleteButton
                lessonId={lesson.id}
                lessonTitle={lesson.title}
              />
            </div>
          )}

          {role === "student" && (
            <Link
              href={href}
              className="text-xs font-semibold text-primary group-hover:underline flex items-center gap-1"
            >
              Watch <Play className="h-3 w-3 fill-current" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
