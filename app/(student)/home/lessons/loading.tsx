import { Skeleton } from "@/components/ui/skeleton";

export default function StudentLessonsLoading() {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-150">
      <div className="p-4 sm:p-6 pb-0 space-y-3">
        <div className="space-y-1">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>
        {/* Batch Filter Pills Skeleton */}
        <div className="flex items-center gap-2 pt-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </div>

      {/* Lesson Cards Grid Skeleton */}
      <div className="p-4 sm:p-6 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-4 space-y-2.5">
                <Skeleton className="h-4 w-3/4 rounded-md" />
                <Skeleton className="h-3.5 w-full rounded-md" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-3 w-20 rounded-md" />
                  <Skeleton className="h-3 w-16 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
