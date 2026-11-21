// app/disabled/page.tsx
// Shown to students whose account has been deactivated by the teacher.
// This page is public (no auth required) so deactivated users can see it.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account Disabled",
};

export default function DisabledPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="max-w-sm space-y-6">
        {/* Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Account disabled
          </h1>
          <p className="text-muted-foreground">
            Your Edvora account has been disabled. Please contact your teacher
            to have it reactivated.
          </p>
        </div>

        {/* Back to login */}
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
