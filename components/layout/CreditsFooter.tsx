// components/layout/CreditsFooter.tsx
// Credits attribution component for FrostLabs Studio.

import React from "react";

interface CreditsFooterProps {
  variant?: "minimal" | "full";
  className?: string;
}

export function CreditsFooter({ variant = "minimal", className = "" }: CreditsFooterProps) {
  if (variant === "minimal") {
    return (
      <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
        <p className="text-[11px] text-muted-foreground/75 flex items-center justify-center gap-1.5">
          <span>Engineered by</span>
          <span className="font-bold tracking-tight text-foreground/90">
            FrostLabs Studio
          </span>
        </p>
      </div>
    );
  }

  return (
    <footer className={`border-t border-border/60 bg-card/40 py-5 px-4 sm:px-6 select-none ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2.5 text-xs text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-black tracking-tight text-foreground">Edvora</span>
          <span className="text-muted-foreground/40">·</span>
          <span>Engineering Technology Tuition Portal</span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <span>Engineered by</span>
          <strong className="font-bold text-foreground">FrostLabs Studio</strong>
        </div>
      </div>
    </footer>
  );
}
