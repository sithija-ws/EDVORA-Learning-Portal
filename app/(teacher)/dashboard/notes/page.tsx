// app/(teacher)/dashboard/notes/page.tsx
// Teacher notes repository — manage and upload PDF study materials.

import React from "react";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { NoteCard } from "@/components/notes/NoteCard";
import type { Note, Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Study Notes – Edvora",
};

interface TeacherNotesPageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function TeacherNotesPage({
  searchParams,
}: TeacherNotesPageProps) {
  const { batchId } = await searchParams;
  const supabase = await createServerClient();

  // 1. Fetch all batches
  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  // 2. Fetch notes
  let notesQuery = supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (batchId) {
    const { data: noteBatchesData } = await supabase
      .from("note_batches")
      .select("note_id")
      .eq("batch_id", batchId);

    const noteIds = noteBatchesData?.map((nb) => nb.note_id) ?? [];
    notesQuery = notesQuery.in("id", noteIds.length > 0 ? noteIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: notesData } = await notesQuery;
  const notes: Note[] = notesData ?? [];

  // 3. Fetch batch assignments for notes
  const noteIds = notes.map((n) => n.id);
  const noteToBatchesMap = new Map<string, Batch[]>();

  if (noteIds.length > 0) {
    const { data: noteBatches } = await supabase
      .from("note_batches")
      .select("note_id, batch_id")
      .in("note_id", noteIds);

    noteBatches?.forEach((nb) => {
      const b = batchMap.get(nb.batch_id);
      if (b) {
        const existing = noteToBatchesMap.get(nb.note_id) || [];
        existing.push(b);
        noteToBatchesMap.set(nb.note_id, existing);
      }
    });
  }

  return (
    <div>
      <PageHeader
        title="Study Notes & Handouts"
        description="Upload and distribute PDF study guides, revision materials, and problem sets."
        action={
          <Link
            href="/dashboard/notes/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Upload PDF Note</span>
          </Link>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Batch filter tabs */}
        {batches.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <Link
              href="/dashboard/notes"
              className={`rounded-full px-3 py-1 font-semibold transition-all shrink-0 ${
                !batchId
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All Batches ({notes.length})
            </Link>

            {batches.map((b) => {
              const isActive = batchId === b.id;
              return (
                <Link
                  key={b.id}
                  href={`/dashboard/notes?batchId=${b.id}`}
                  className={`rounded-full px-3 py-1 font-semibold transition-all shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {b.name}
                </Link>
              );
            })}
          </div>
        )}

        {/* Notes Grid */}
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FileText className="h-7 w-7" />
            </div>
            <h3 className="text-base font-black text-foreground">
              No notes uploaded yet
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Upload PDF theory handouts or past paper discussions for your students.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/notes/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>Upload First PDF Note</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                batches={noteToBatchesMap.get(note.id) ?? []}
                role="teacher"
                href={`/dashboard/notes/${note.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
