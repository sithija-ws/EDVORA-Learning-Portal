// app/(teacher)/dashboard/page.tsx
// Teacher dashboard — main overview page.
// Full implementation in Milestone 2.
// Stub ensures the route and layout structure is in place for M0 build.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function TeacherDashboardPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back. Manage your batches, lessons, and announcements here.
        </p>
      </div>

      {/* Content implemented in Milestone 2 */}
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Batch overview — Milestone 2
      </div>
    </div>
  );
}
