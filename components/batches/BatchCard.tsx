// components/batches/BatchCard.tsx
// Summary card for a tuition batch with technical details and metrics.

import React from "react";
import Link from "next/link";
import { Users, Archive, Calendar, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Batch } from "@/types";

interface BatchCardProps {
  batch: Batch & { student_count?: number };
}

export function BatchCard({ batch }: BatchCardProps) {
  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md">
      {/* Accent stripe top */}
      <div
        className={`h-1 w-full ${
          batch.is_archived
            ? "bg-muted-foreground/30"
            : "bg-gradient-to-r from-primary to-amber-500"
        }`}
      />

      <div className="p-5 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black tracking-tight text-foreground leading-tight group-hover:text-primary transition-colors">
                {batch.name}
              </h2>
              {batch.is_archived && (
                <Badge
                  variant="outline"
                  className="gap-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
                >
                  <Archive className="h-3 w-3" />
                  Archived
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                <span>A/L {batch.year}</span>
              </span>
            </div>
          </div>
        </div>

        {batch.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {batch.description}
          </p>
        )}
      </div>

      {/* Footer Strip */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3">
        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span>
            {batch.student_count !== undefined
              ? `${batch.student_count} student${batch.student_count === 1 ? "" : "s"}`
              : "View details"}
          </span>
        </div>

        <Link
          href={`/dashboard/batches/${batch.id}`}
          className="inline-flex items-center gap-1 text-xs font-bold text-primary group-hover:underline"
        >
          <span>Manage</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
