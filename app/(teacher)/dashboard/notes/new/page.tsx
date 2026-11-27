// app/(teacher)/dashboard/notes/new/page.tsx
// Teacher page to upload a new PDF study note.

import React from "react";
import { connection } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { NoteForm } from "@/components/notes/NoteForm";
import type { Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "Upload PDF Note – Edvora",
};

interface NewNotePageProps {
  searchParams: Promise<{ batchId?: string }>;
}

export default async function NewNotePage({ searchParams }: NewNotePageProps) {
  await connection();
  const { batchId } = await searchParams;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

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
        title="Upload PDF Note"
        description="Attach a PDF handout, tutorial problem set, or revision material to tuition batches."
        backHref={batchId ? `/dashboard/batches/${batchId}` : "/dashboard/notes"}
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs max-w-2xl">
          <NoteForm
            batches={batches}
            preSelectedBatchId={batchId}
          />
        </div>
      </div>
    </div>
  );
}
