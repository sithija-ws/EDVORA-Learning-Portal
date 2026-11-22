// components/layout/CreditsFooter.tsx
// Credits badge & WhatsApp contact component for FrostLabs Studio.

import React from "react";

interface CreditsFooterProps {
  variant?: "minimal" | "full";
  className?: string;
}

function WhatsAppIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z" />
    </svg>
  );
}

export function CreditsFooter({ variant = "minimal", className = "" }: CreditsFooterProps) {
  const whatsappUrl =
    "https://wa.me/94787494303?text=Hi%20FrostLabs%20Studio%2C%20contacting%20regarding%20Edvora";

  if (variant === "minimal") {
    return (
      <div className={`flex flex-col items-center gap-2 text-center select-none ${className}`}>
        <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
          <span>Engineered by</span>
          <span className="font-bold tracking-tight text-foreground/90">
            FrostLabs Studio
          </span>
        </p>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all active:scale-95"
          title="Contact FrostLabs Studio on WhatsApp"
        >
          <WhatsAppIcon className="h-3 w-3 fill-emerald-600 dark:fill-emerald-400" />
          <span>WhatsApp · 078 749 4303</span>
        </a>
      </div>
    );
  }

  return (
    <footer className={`border-t border-border/60 bg-card/40 py-6 px-4 sm:px-6 select-none ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-black tracking-tight text-foreground">Edvora</span>
          <span className="text-muted-foreground/40">·</span>
          <span>Engineering Technology Tuition Portal</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-[11px]">
            Engineered by <strong className="font-bold text-foreground">FrostLabs Studio</strong>
          </span>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all active:scale-95"
            title="Chat with FrostLabs Studio on WhatsApp"
          >
            <WhatsAppIcon className="h-3 w-3 fill-emerald-600 dark:fill-emerald-400" />
            <span>078 749 4303</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
