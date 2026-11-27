// app/(teacher)/dashboard/notes/[noteId]/edit/page.tsx
// Teacher page to edit note details, replace PDF, or reassign batches.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext, getTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { NoteForm } from "@/components/notes/NoteForm";
import type { Note, Batch } from "@/types";

export const instant = false;

interface EditNotePageProps {
  params: Promise<{ noteId: string }>;
}

export async function generateMetadata({ params }: EditNotePageProps) {
  const { noteId } = await params;
  const tenantRes = await getTenantContext();
  if (tenantRes.status !== "resolved") {
    return { title: "Edit Note – Edvora" };
  }
  const supabase = await createServerClient();
  const { data: note } = await supabase
    .from("notes")
    .select("title")
    .eq("id", noteId)
    .eq("tenant_id", tenantRes.context.tenantId)
    .maybeSingle();

  return {
    title: note ? `Edit: ${note.title} – Edvora` : "Edit Note – Edvora",
  };
}

export default async function EditNotePage({ params }: EditNotePageProps) {
  const { noteId } = await params;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  const { data: noteData } = await supabase
    .from("notes")
    .select("*")
    .eq("id", noteId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (!noteData) {
    notFound();
  }

  const note: Note = noteData;

  const { data: junctions } = await supabase
    .from("note_batches")
    .select("batch_id")
    .eq("note_id", noteId)
    .eq("tenant_id", tenant.tenantId);

  const assignedBatchIds = junctions?.map((j) => j.batch_id) ?? [];

  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];

  return (
    <div>
      <PageHeader
        title={`Edit Note: ${note.title}`}
        description="Update title, description, replace PDF file, or modify assigned batches."
        backHref={`/dashboard/notes/${note.id}`}
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs max-w-2xl">
          <NoteForm
            batches={batches}
            note={{
              ...note,
              batch_ids: assignedBatchIds,
            }}
          />
        </div>
      </div>
    </div>
  );
}
