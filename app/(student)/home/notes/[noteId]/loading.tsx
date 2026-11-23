import { Skeleton } from "@/components/ui/skeleton";

export default function StudentNoteReadLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24 sm:pb-12 max-w-5xl mx-auto animate-in fade-in-50 duration-150">
      {/* ── Navigation Breadcrumb Bar Skeleton ─────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-5 w-24 rounded-md" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      {/* ── PDF Reader Container Skeleton ──────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg space-y-0">
        <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
        <Skeleton className="w-full h-[650px]" />
      </div>
    </div>
  );
}
