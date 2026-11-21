// app/(teacher)/dashboard/batches/new/page.tsx
// Page to create a new batch.

import React from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { BatchForm } from "@/components/batches/BatchForm";

export const instant = false;

export const metadata = {
  title: "New Batch — Edvora",
};

export default function NewBatchPage() {
  return (
    <div>
      <PageHeader
        title="Create New Batch"
        description="Add a new A/L tuition batch to begin enrolling students."
        backHref="/dashboard/batches"
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs">
          <BatchForm />
        </div>
      </div>
    </div>
  );
}
