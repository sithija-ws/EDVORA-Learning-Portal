// app/(auth)/login/page.tsx
// Login page — shared entry point for teacher and student.
// Actual form logic (LoginForm) implemented in Milestone 1.
// This stub ensures the route exists and the layout is correct for M0 build.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Edvora
          </h1>
          <p className="text-sm text-muted-foreground">
            Engineering Technology Tuition Platform
          </p>
        </div>

        {/* Login form placeholder — implemented in Milestone 1 */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Enter your username and password to access your batch.
            </p>
          </div>

          {/* Form will be implemented in Milestone 1 */}
          <div className="rounded-md bg-muted/50 p-4 text-center text-sm text-muted-foreground">
            Login form — Milestone 1
          </div>
        </div>
      </div>
    </div>
  );
}
