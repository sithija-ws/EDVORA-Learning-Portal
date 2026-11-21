// app/(student)/home/page.tsx
// Student home page — batch header + recent announcements.
// Full implementation in Milestone 3/4/5.
// Stub ensures the route exists for M0 build.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function StudentHomePage() {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your Batch
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {/* Batch name populated in Milestone 2 */}
          Edvora
        </h1>
      </div>

      {/* Announcements and lessons — Milestone 3/4 */}
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Announcements and lessons — Milestone 3/4
      </div>
    </div>
  );
}
