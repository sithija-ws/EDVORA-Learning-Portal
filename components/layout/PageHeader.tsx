// components/layout/PageHeader.tsx
// Page header with strong typographic hierarchy and optional back navigation.

import React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  backHref,
  badge,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border bg-card px-4 py-5 sm:px-6 sm:py-6",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="flex items-center gap-2.5 truncate">
            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl truncate">
              {title}
            </h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}
