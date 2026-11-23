// app/(teacher)/dashboard/notes/[noteId]/page.tsx
// Teacher view of a single PDF note with embedded PDF reader and edit action.

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { PdfViewer } from "@/components/notes/PdfViewer";
import { NoteDeleteButton } from "@/components/notes/NoteDeleteButton";
import { Badge } from "@/components/ui/badge";
import { Edit } from "lucide-react";
import type { Note, Batch } from "@/types";

export const instant = false;

interface TeacherNoteDetailPageProps {
  params: Promise<{ noteId: string }>;
}

export async function generateMetadata({ params }: TeacherNoteDetailPageProps) {
  const { noteId } = await params;
  const supabase = await createServerClient();
  const { data: note } = await supabase
    .from("notes")
    .select("title")
    .eq("id", noteId)
    .single();

  return {
    title: note ? `${note.title} – Edvora` : "Note Details – Edvora",
  };
}

export default async function TeacherNoteDetailPage({
  params,
}: TeacherNoteDetailPageProps) {
  const { noteId } = await params;
  const supabase = await createServerClient();

  // 1. Fetch note details and assigned batch junctions concurrently in parallel
  const [{ data: noteData }, { data: junctions }] = await Promise.all([
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

  if (!noteData) {
    notFound();
  }

  const note: Note = noteData;

  // 2. Fetch assigned batches
  const batchIds = junctions?.map((j) => j.batch_id) ?? [];
  let batches: Batch[] = [];

  if (batchIds.length > 0) {
    const { data: batchesData } = await supabase
      .from("batches")
      .select("*")
      .in("id", batchIds);
    batches = batchesData ?? [];
  }

  return (
    <div>
      <PageHeader
        title={note.title}
        description={note.description ?? `PDF Document: ${note.file_name}`}
        backHref="/dashboard/notes"
        badge={
          <div className="flex flex-wrap items-center gap-1">
            {batches.map((b) => (
              <Badge
                key={b.id}
                variant="outline"
                className="font-mono text-[10px] font-bold border-primary/30 text-primary bg-primary/5"
              >
                {b.name}
              </Badge>
            ))}
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/notes/${note.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Link>
            <NoteDeleteButton
              noteId={note.id}
              noteTitle={note.title}
              redirectTo="/dashboard/notes"
            />
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        <PdfViewer
          fileUrl={note.file_url}
          fileName={note.file_name}
          title={note.title}
        />

        {note.description && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
              Study Notes Overview
            </h3>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {note.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
