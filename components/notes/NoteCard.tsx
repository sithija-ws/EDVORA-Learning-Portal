// components/notes/NoteCard.tsx
// Modern, tactile note card for PDF study materials in teacher and student portals.

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { NoteDeleteButton } from "./NoteDeleteButton";
import { FileText, Download, Edit, ArrowRight, Eye } from "lucide-react";
import type { Note, Batch } from "@/types";

interface NoteCardProps {
  note: Note;
  batches?: Batch[];
  role: "teacher" | "student";
  href: string;
  showActions?: boolean;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return "PDF Doc";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NoteCard({
  note,
  batches = [],
  role,
  href,
  showActions = true,
}: NoteCardProps) {
  return (
    <div className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md">
      {/* Top Card Body */}
      <div className="p-5 space-y-3">
        {/* Header with PDF emblem and size */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
            <FileText className="h-5 w-5" />
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
              {formatBytes(note.file_size)}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatDate(note.created_at)}
            </span>
          </div>
        </div>

        {/* Title and Notes */}
        <div className="space-y-1">
          <Link href={href} className="block">
            <h3 className="text-sm font-black tracking-tight text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {note.title}
            </h3>
          </Link>

          {note.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed pt-1">
              {note.description}
            </p>
          )}
        </div>

        {/* Batch assignment tags */}
        {batches.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {batches.map((b) => (
              <Badge
                key={b.id}
                variant="outline"
                className="text-[9px] font-mono font-bold uppercase tracking-wider border-primary/30 text-primary bg-primary/5"
              >
                {b.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Footer Action Row */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3">
        {role === "student" ? (
          <>
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary group-hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Read Online</span>
              <ArrowRight className="h-3 w-3" />
            </Link>

            <a
              href={note.file_url}
              download={note.file_name}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-card hover:text-foreground transition-all"
              title="Download PDF file"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </>
        ) : (
          <>
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              <span>View Notes</span>
              <ArrowRight className="h-3 w-3" />
            </Link>

            {showActions && (
              <div className="flex items-center gap-1">
                <Link
                  href={`${href}/edit`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </Link>
                <NoteDeleteButton noteId={note.id} noteTitle={note.title} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
