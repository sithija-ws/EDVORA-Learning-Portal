// app/(auth)/login/page.tsx
// Login page — shared entry point for teacher and students.

import type { Metadata } from "next";
import { LoginForm } from "./_components/LoginForm";

export const metadata: Metadata = {
  title: "Sign In — Edvora",
  description: "Sign in to access your Engineering Technology tuition batch.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand Header */}
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
            E
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Edvora
          </h1>
          <p className="text-sm text-muted-foreground">
            Engineering Technology Tuition Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
            <p className="text-xs text-muted-foreground">
              Students sign in with their assigned username. The teacher signs in
              with their registered email address.
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Need access or forgot credentials? Contact your teacher.
        </p>
      </div>
    </div>
  );
}
