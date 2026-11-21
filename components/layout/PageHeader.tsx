// components/layout/PageHeader.tsx
// Lightweight, responsive page header component.

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
        "flex flex-col gap-2 border-b bg-card/50 px-4 py-4 backdrop-blur-xs sm:px-6 sm:py-5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="flex items-center gap-2 truncate">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl truncate">
              {title}
            </h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
