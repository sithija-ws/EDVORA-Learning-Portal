// components/batches/BatchCard.tsx
// Summary card for a batch shown on the teacher dashboard and batches list.

import React from "react";
import Link from "next/link";
import { Users, ChevronRight, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Batch } from "@/types";

interface BatchCardProps {
  batch: Batch & { student_count?: number };
}

export function BatchCard({ batch }: BatchCardProps) {
  return (
    <div className="group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-primary/50 hover:shadow-md">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {batch.name}
              </h2>
              {batch.is_archived && (
                <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                  <Archive className="h-3 w-3" />
                  Archived
                </Badge>
              )}
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              A/L Batch {batch.year}
            </p>
          </div>
        </div>

        {batch.description && (
          <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
            {batch.description}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>
            {batch.student_count !== undefined
              ? `${batch.student_count} student${batch.student_count === 1 ? "" : "s"}`
              : "View details"}
          </span>
        </div>

        <Link
          href={`/dashboard/batches/${batch.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform"
        >
          <span>Manage</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
