// app/(teacher)/dashboard/notes/page.tsx
// Teacher notes repository — manage and upload PDF study materials.

import React from "react";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/auth/tenant";
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
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  let batchesData: Batch[] | null = null;
  let allNoteBatches: { note_id: string; batch_id: string }[] | null = null;
  let notesData: Note[] | null = null;

  if (!batchId) {
    // Fast-path: When viewing all notes (default), fetch batches, junctions, and notes concurrently in 1 parallel roundtrip scoped to tenant
    const [bRes, nbRes, nRes] = await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .eq("tenant_id", tenant.tenantId)
        .order("year", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("note_batches")
        .select("note_id, batch_id")
        .eq("tenant_id", tenant.tenantId),
      supabase
        .from("notes")
        .select("*")
        .eq("tenant_id", tenant.tenantId)
        .order("created_at", { ascending: false }),
    ]);
    batchesData = bRes.data;
    allNoteBatches = nbRes.data;
    notesData = nRes.data;
  } else {
    // When batchId is present, fetch batches & junctions first to resolve scoped note IDs scoped to tenant
    const [bRes, nbRes] = await Promise.all([
      supabase
        .from("batches")
        .select("*")
        .eq("tenant_id", tenant.tenantId)
        .order("year", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("note_batches")
        .select("note_id, batch_id")
        .eq("tenant_id", tenant.tenantId),
    ]);
    batchesData = bRes.data;
    allNoteBatches = nbRes.data;

    const scopedNoteIds: string[] = [];
    nbRes.data?.forEach((nb) => {
      if (nb.batch_id === batchId) {
        scopedNoteIds.push(nb.note_id);
      }
    });

    if (scopedNoteIds.length > 0) {
      const { data: nData } = await supabase
        .from("notes")
        .select("*")
        .eq("tenant_id", tenant.tenantId)
        .in("id", scopedNoteIds)
        .order("created_at", { ascending: false });
      notesData = nData;
    } else {
      notesData = [];
    }
  }

  const batches: Batch[] = batchesData ?? [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  // Build noteId -> Batch[] map in memory
  const noteToBatchesMap = new Map<string, Batch[]>();

  allNoteBatches?.forEach((nb) => {
    const b = batchMap.get(nb.batch_id);
    if (b) {
      const existing = noteToBatchesMap.get(nb.note_id) || [];
      existing.push(b);
      noteToBatchesMap.set(nb.note_id, existing);
    }
  });

  const notes: Note[] = notesData ?? [];

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
