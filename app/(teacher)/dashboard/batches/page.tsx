// app/(teacher)/dashboard/batches/page.tsx
// Listing page for all batches (active and archived).

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { BatchCard } from "@/components/batches/BatchCard";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Batch } from "@/types";

export const instant = false;

export const metadata = {
  title: "All Batches — Edvora",
};

export default async function BatchesPage() {
  const supabase = await createServerClient();

  const { data: batchesData } = await supabase
    .from("batches")
    .select("*")
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const batches: Batch[] = batchesData ?? [];

  const { data: enrollmentsData } = await supabase
    .from("enrollments")
    .select("batch_id");

  const countMap: Record<string, number> = {};
  enrollmentsData?.forEach((e) => {
    countMap[e.batch_id] = (countMap[e.batch_id] || 0) + 1;
  });

  const batchesWithCount = batches.map((b) => ({
    ...b,
    student_count: countMap[b.id] || 0,
  }));

  return (
    <div>
      <PageHeader
        title="Batches"
        description="All tuition classes across all A/L examination years."
        backHref="/dashboard"
        action={
          <Link
            href="/dashboard/batches/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>New Batch</span>
          </Link>
        }
      />

      <div className="p-4 sm:p-6">
        {batchesWithCount.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center text-muted-foreground">
            <p className="text-sm">No batches found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batchesWithCount.map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
