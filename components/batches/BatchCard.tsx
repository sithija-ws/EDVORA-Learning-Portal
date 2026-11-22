// components/batches/BatchCard.tsx
// Summary card for a batch — editorial card style with accent stripe.

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
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
      {/* Accent stripe top */}
      <div
        className={`h-1 w-full ${batch.is_archived ? "bg-muted-foreground/30" : "bg-primary"}`}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black tracking-tight text-foreground leading-tight">
                {batch.name}
              </h2>
              {batch.is_archived && (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <Archive className="h-3 w-3" />
                  Archived
                </Badge>
              )}
            </div>
            <p className="text-xs font-semibold text-muted-foreground">
              A/L Batch · {batch.year}
            </p>
          </div>
        </div>

        {batch.description && (
          <p className="mt-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {batch.description}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>
            {batch.student_count !== undefined
              ? `${batch.student_count} student${batch.student_count === 1 ? "" : "s"}`
              : "View details"}
          </span>
        </div>

        <Link
          href={`/dashboard/batches/${batch.id}`}
          className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-transform group-hover:translate-x-0.5"
        >
          <span>Manage</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
