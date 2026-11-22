// components/notes/PdfViewer.tsx
// In-app PDF reader with responsive toolbar, fullscreen toggle, and download capability.

"use client";

import React, { useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Maximize2 } from "lucide-react";

interface PdfViewerProps {
  fileUrl: string;
  fileName: string;
  title: string;
}

export function PdfViewer({ fileUrl, fileName, title }: PdfViewerProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/5">
      {/* ── PDF Reader Toolbar ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-foreground truncate">
              {title}
            </h2>
            <p className="text-[10px] font-mono text-muted-foreground truncate">
              {fileName}
            </p>
          </div>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            title="Open in new tab"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fullscreen</span>
          </a>

          <a
            href={fileUrl}
            download={fileName}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* ── Embedded PDF Viewing Surface ──────────────────────────── */}
      <div className="relative w-full h-[70vh] sm:h-[80vh] bg-zinc-900">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/90 z-10 text-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <span className="text-xs font-medium text-muted-foreground">
              Opening study notes...
            </span>
          </div>
        )}

        <iframe
          src={`${fileUrl}#view=FitH&toolbar=1`}
          title={title}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          className="w-full h-full border-0"
        />

        {/* Mobile Fallback Overlay (in case browser restricts mobile iframe PDF rendering) */}
        <noscript>
          <div className="p-8 text-center text-white space-y-3">
            <p className="text-sm">Please open the PDF directly:</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open PDF</span>
            </a>
          </div>
        </noscript>
      </div>
    </div>
  );
}
