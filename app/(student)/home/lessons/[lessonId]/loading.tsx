import { Skeleton } from "@/components/ui/skeleton";

export default function StudentLessonWatchLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24 sm:pb-12 max-w-4xl mx-auto animate-in fade-in-50 duration-150">
      {/* ── Navigation Breadcrumb Bar Skeleton ─────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      {/* ── Video Player Skeleton (16:9) ───────────────────────────── */}
      <Skeleton className="aspect-video w-full rounded-2xl" />

      {/* ── Lesson Title & Metadata Strip Skeleton ─────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-4 w-28 rounded-md" />
          </div>
          <Skeleton className="h-7 w-3/4 rounded-lg" />
        </div>
        <div className="space-y-2 pt-2 border-t border-border/60">
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-5/6 rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
      </div>
    </div>
  );
}
