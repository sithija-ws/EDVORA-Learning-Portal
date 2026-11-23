import { Skeleton } from "@/components/ui/skeleton";

export default function StudentAnnouncementsLoading() {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-150">
      <div className="p-4 sm:p-6 pb-0 space-y-3">
        <div className="space-y-1">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-4 w-60 rounded-md" />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
      </div>

      <div className="p-4 sm:p-6 pt-2 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-48 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
            </div>
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-3/4 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
