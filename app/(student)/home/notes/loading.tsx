import { Skeleton } from "@/components/ui/skeleton";

export default function StudentNotesLoading() {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-150">
      <div className="p-4 sm:p-6 pb-0 space-y-3">
        <div className="space-y-1">
          <Skeleton className="h-7 w-36 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        {/* Batch Filter Pills Skeleton */}
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </div>

      {/* Notes Grid Skeleton */}
      <div className="p-4 sm:p-6 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
              <Skeleton className="h-5 w-3/4 rounded-md" />
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-2/3 rounded-md" />
              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
