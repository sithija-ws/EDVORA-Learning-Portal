import { Skeleton } from "@/components/ui/skeleton";

export default function StudentHomeLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24 sm:pb-12 max-w-4xl mx-auto animate-in fade-in-50 duration-150">
      {/* ── 1. Telemetry & Welcome Banner Skeleton ───────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-4 w-36 rounded-md" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48 sm:w-64 rounded-lg" />
            <Skeleton className="h-3.5 w-40 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-12 w-20 rounded-xl" />
            <Skeleton className="h-12 w-20 rounded-xl" />
            <Skeleton className="h-12 w-20 rounded-xl" />
          </div>
        </div>
      </div>

      {/* ── 2. Hero Lesson Spotlight Skeleton ───────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 items-center">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-2/3 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-lg mt-2" />
          </div>
        </div>
      </div>

      {/* ── 3. Lessons Grid Skeleton ─────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
