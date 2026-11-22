// components/announcements/AnnouncementCard.tsx
// Notice card — editorial style with pinned state highlighting.

import React from "react";
import Link from "next/link";
import { Pin, Edit, Radio } from "lucide-react";
import { AnnouncementDeleteButton } from "./AnnouncementDeleteButton";
import { AnnouncementPinButton } from "./AnnouncementPinButton";
import type { Announcement, Batch } from "@/types";

interface AnnouncementCardProps {
  announcement: Announcement & { batches?: Batch[] };
  role: "teacher" | "student";
  batches?: Batch[];
  showActions?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AnnouncementCard({
  announcement,
  role,
  batches: batchesProp,
  showActions = true,
}: AnnouncementCardProps) {
  const isPinned = announcement.is_pinned;
  // Support both embedded `announcement.batches` and separately passed `batches` prop
  const displayBatches = batchesProp ?? announcement.batches ?? [];

  return (
    <div
      className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 ${
        isPinned
          ? "border-primary/40 bg-primary/5 shadow-xs"
          : "border-border bg-card hover:border-primary/20 hover:shadow-xs"
      }`}
    >
      {/* Pinned accent stripe */}
      {isPinned && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-primary" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isPinned && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Pin className="h-3 w-3 fill-current" />
                Pinned
              </span>
            )}
            {announcement.is_broadcast && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Radio className="h-3 w-3" />
                All Batches
              </span>
            )}
          </div>
          <h3 className="text-sm font-black tracking-tight text-foreground leading-snug">
            {announcement.title}
          </h3>
        </div>

        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {formatDate(announcement.created_at)}
        </span>
      </div>

      {/* Body */}
      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap pl-1 line-clamp-4">
        {announcement.body}
      </p>

      {/* Batch tags */}
      {displayBatches.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-1">
          {displayBatches.map((b) => (
            <span
              key={b.id}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
            >
              {b.name}
            </span>
          ))}
        </div>
      )}

      {/* Teacher actions */}
      {role === "teacher" && showActions && (
        <div className="flex items-center gap-1 border-t border-border pt-3 pl-1">
          <AnnouncementPinButton
            announcementId={announcement.id}
            isPinned={isPinned}
          />
          <Link
            href={`/dashboard/announcements/${announcement.id}/edit`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Link>
          <AnnouncementDeleteButton
            announcementId={announcement.id}
            announcementTitle={announcement.title}
          />
        </div>
      )}
    </div>
  );
}
