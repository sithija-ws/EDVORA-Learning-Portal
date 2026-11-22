// components/announcements/AnnouncementCard.tsx
// Responsive card component for text notices in teacher and student views.

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AnnouncementDeleteButton } from "./AnnouncementDeleteButton";
import { AnnouncementPinButton } from "./AnnouncementPinButton";
import { Pin, Radio, Edit, Calendar } from "lucide-react";
import type { Announcement, Batch } from "@/types";

interface AnnouncementCardProps {
  announcement: Announcement;
  batches?: Batch[];
  role: "teacher" | "student";
  showActions?: boolean;
}

export function AnnouncementCard({
  announcement,
  batches = [],
  role,
  showActions = true,
}: AnnouncementCardProps) {
  const isPinned = announcement.is_pinned;
  const isBroadcast = announcement.is_broadcast;

  return (
    <article
      className={`relative overflow-hidden rounded-xl border p-5 shadow-xs transition-all ${
        isPinned
          ? "border-amber-400/80 bg-gradient-to-b from-amber-50/40 to-background shadow-xs"
          : "bg-card text-card-foreground hover:border-primary/30"
      }`}
    >
      {/* Top Header: Badges & Date */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/40">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Pinned Tag */}
          {isPinned && (
            <Badge
              variant="outline"
              className="border-amber-400 bg-amber-100 text-amber-900 text-[10px] font-semibold gap-1 px-2"
            >
              <Pin className="h-3 w-3 fill-amber-700 text-amber-700" />
              <span>Pinned</span>
            </Badge>
          )}

          {/* Broadcast Tag */}
          {isBroadcast ? (
            <Badge className="bg-indigo-600 text-white hover:bg-indigo-700 text-[10px] gap-1 px-2 font-medium">
              <Radio className="h-3 w-3" />
              <span>All Batches</span>
            </Badge>
          ) : (
            batches.map((b) => (
              <Badge
                key={b.id}
                variant="secondary"
                className="text-[10px] px-2 py-0.5 font-normal"
              >
                {b.name}
              </Badge>
            ))
          )}
        </div>

        {/* Date Published */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <time dateTime={announcement.created_at}>
            {new Date(announcement.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
      </div>

      {/* Title & Body */}
      <div className="pt-3 space-y-2">
        <h3 className="text-base font-bold tracking-tight text-foreground">
          {announcement.title}
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {announcement.body}
        </p>
      </div>

      {/* Teacher Actions Footer */}
      {role === "teacher" && showActions && (
        <div className="mt-4 pt-3 flex items-center justify-end gap-1 border-t border-border/40">
          <AnnouncementPinButton
            announcementId={announcement.id}
            isPinned={isPinned}
          />
          <Link
            href={`/dashboard/announcements/${announcement.id}/edit`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Edit Announcement"
          >
            <Edit className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Link>
          <AnnouncementDeleteButton
            announcementId={announcement.id}
            announcementTitle={announcement.title}
          />
        </div>
      )}
    </article>
  );
}
