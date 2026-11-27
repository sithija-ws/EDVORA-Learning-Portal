// app/(teacher)/dashboard/batches/[batchId]/students/new/page.tsx
// Page to create a student account and enroll them in batches.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentForm } from "@/components/students/StudentForm";
import type { Batch } from "@/types";

export const instant = false;

interface NewStudentPageProps {
  params: Promise<{ batchId: string }>;
}

export const metadata = {
  title: "Add Student — Edvora",
};

export default async function NewStudentPage({ params }: NewStudentPageProps) {
  const { batchId } = await params;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  // 1. Fetch current batch scoped to tenant
  const { data: currentBatch } = await supabase
    .from("batches")
    .select("name")
    .eq("id", batchId)
    .eq("tenant_id", tenant.tenantId)
    .single();

  if (!currentBatch) {
    notFound();
  }

  // 2. Fetch all batches for multi-batch assignment scoped to tenant
  const { data: allBatchesData } = await supabase
    .from("batches")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = allBatchesData ?? [];

  return (
    <div>
      <PageHeader
        title="Add New Student"
        description={`Create a login account and enroll in ${currentBatch.name}.`}
        backHref={`/dashboard/batches/${batchId}`}
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <StudentForm
            batches={batches}
            preSelectedBatchId={batchId}
          />
        </div>
      </div>
    </div>
  );
}
