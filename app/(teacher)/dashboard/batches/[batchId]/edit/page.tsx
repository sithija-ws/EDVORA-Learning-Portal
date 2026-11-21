// app/(teacher)/dashboard/batches/[batchId]/edit/page.tsx
// Page to edit batch information or archive status.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { BatchForm } from "@/components/batches/BatchForm";

export const instant = false;

interface EditBatchPageProps {
  params: Promise<{ batchId: string }>;
}

export async function generateMetadata({ params }: EditBatchPageProps) {
  const { batchId } = await params;
  const supabase = await createServerClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("name")
    .eq("id", batchId)
    .single();

  return {
    title: batch ? `Edit ${batch.name} — Edvora` : "Edit Batch — Edvora",
  };
}

export default async function EditBatchPage({ params }: EditBatchPageProps) {
  const { batchId } = await params;
  const supabase = await createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (!batch) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${batch.name}`}
        description="Update class information or archive settings."
        backHref={`/dashboard/batches/${batch.id}`}
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <BatchForm batch={batch} />
        </div>
      </div>
    </div>
  );
}
