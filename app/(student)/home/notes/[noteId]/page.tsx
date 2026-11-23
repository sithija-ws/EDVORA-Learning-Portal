// app/(student)/home/notes/[noteId]/page.tsx
// High-focus student in-app PDF study console with sequential document playlist navigation.

import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PdfViewer } from "@/components/notes/PdfViewer";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Calendar,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Note } from "@/types";

export const instant = false;

interface StudentNoteReadPageProps {
  params: Promise<{ noteId: string }>;
}

export async function generateMetadata({ params }: StudentNoteReadPageProps) {
  const { noteId } = await params;
  const supabase = await createServerClient();
  const { data: note } = await supabase
    .from("notes")
    .select("title")
    .eq("id", noteId)
    .single();

  return {
    title: note ? `${note.title} – Edvora` : "Read Note – Edvora",
  };
}

export default async function StudentNoteReadPage({
  params,
}: StudentNoteReadPageProps) {
  const { noteId } = await params;
  const supabase = await createServerClient();

  // 1. Authenticate student
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? (await supabase.auth.getUser()).data.user;

  if (!user) {
    redirect("/login");
  }

  // 2. Stage 1 concurrent fetch: profile, enrollments, note details, and note_batches in parallel
  const [
    { data: profile },
    { data: enrollments },
    { data: noteData },
    { data: noteBatches },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("batch_id")
      .eq("student_id", user.id),
    supabase
      .from("notes")
      .select("*")
      .eq("id", noteId)
      .single(),
    supabase
      .from("note_batches")
      .select("batch_id")
      .eq("note_id", noteId),
  ]);

  if (!profile || !profile.is_active) {
    redirect("/disabled");
  }

  if (!noteData) {
    notFound();
  }

  const enrolledBatchIds = enrollments?.map((e) => e.batch_id) ?? [];
  if (enrolledBatchIds.length === 0) {
    notFound();
  }

  // Verify batch authorization: Note must belong to at least one enrolled batch
  const matchingJunction = noteBatches?.filter((nb) =>
    enrolledBatchIds.includes(nb.batch_id)
  ) ?? [];

  if (matchingJunction.length === 0) {
    notFound();
  }

  const currentBatchId = matchingJunction[0].batch_id;
  const note: Note = noteData;

  // 3. Stage 2 concurrent fetch: batch details and sibling note junctions in parallel
  const [{ data: batchData }, { data: batchJunctions }] = await Promise.all([
    supabase
      .from("batches")
      .select("name, year")
      .eq("id", currentBatchId)
      .single(),
    supabase
      .from("note_batches")
      .select("note_id")
      .eq("batch_id", currentBatchId),
  ]);

  const siblingIds = batchJunctions?.map((bj) => bj.note_id) ?? [];

  let prevNote: { id: string; title: string } | null = null;
  let nextNote: { id: string; title: string } | null = null;

  if (siblingIds.length > 0) {
    const { data: siblings } = await supabase
      .from("notes")
      .select("id, title, created_at")
      .in("id", siblingIds)
      .order("created_at", { ascending: false });

    const siblingList = siblings ?? [];
    const currentIndex = siblingList.findIndex((s) => s.id === noteId);

    if (currentIndex > 0) {
      prevNote = siblingList[currentIndex - 1];
    }
    if (currentIndex >= 0 && currentIndex < siblingList.length - 1) {
      nextNote = siblingList[currentIndex + 1];
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24 sm:pb-12 max-w-5xl mx-auto">
      {/* ── Navigation Breadcrumb Bar ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <Link
          href="/home/notes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>All Study Notes</span>
        </Link>

        {batchData && (
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/5 font-mono text-[10px] font-bold text-primary"
          >
            {batchData.name} ({batchData.year} A/L)
          </Badge>
        )}
      </div>

      {/* ── Title & Meta Info ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md">
            PDF Handout
          </span>

          <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono text-[11px]">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            {new Date(note.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground leading-snug">
          {note.title}
        </h1>
      </div>

      {/* ── Interactive In-App PDF Viewer ─────────────────────────── */}
      <PdfViewer
        fileUrl={note.file_url}
        fileName={note.file_name}
        title={note.title}
      />

      {/* ── Sibling Navigation Bar ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/30 p-2.5">
        {prevNote ? (
          <Link
            href={`/home/notes/${prevNote.id}`}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-card hover:text-foreground transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline truncate max-w-[160px]">
              {prevNote.title}
            </span>
            <span className="sm:hidden">Previous</span>
          </Link>
        ) : (
          <div className="text-xs text-muted-foreground/40 px-3 py-1.5 font-mono text-[10px]">
            Latest Note
          </div>
        )}

        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
          Study Materials
        </div>

        {nextNote ? (
          <Link
            href={`/home/notes/${nextNote.id}`}
            className="inline-flex items-center gap-1 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95"
          >
            <span className="hidden sm:inline truncate max-w-[160px]">
              {nextNote.title}
            </span>
            <span className="sm:hidden">Next Note</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <div className="text-xs text-muted-foreground/40 px-3 py-1.5 font-mono text-[10px]">
            First Note
          </div>
        )}
      </div>

      {/* ── Study Notes & Instructions Description ────────────────── */}
      {note.description && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
              Instructor Notes & Guidelines
            </h2>
          </div>
          <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-muted-foreground pt-1">
            {note.description}
          </p>
        </div>
      )}
    </div>
  );
}
