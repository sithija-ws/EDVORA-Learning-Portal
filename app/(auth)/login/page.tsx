// app/(auth)/login/page.tsx
// Login page — editorial, warm, non-AI aesthetic with geometry.

import type { Metadata } from "next";
import { LoginForm } from "./_components/LoginForm";

export const metadata: Metadata = {
  title: "Sign In – Edvora",
  description: "Sign in to access your Engineering Technology tuition batch.",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Background geometric accent — warm engineering feel */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Top right warm blob */}
        <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
        {/* Bottom left warm blob */}
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-primary/5 blur-2xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Brand Header */}
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground shadow-lg shadow-primary/30 select-none">
            E
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Edvora
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Engineering Technology Tuition Portal
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-black tracking-tight text-foreground">
              Sign in
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Students sign in with their assigned username. The teacher uses
              their registered email.
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Need access or forgot your credentials?{" "}
          <span className="font-semibold text-foreground">
            Contact your teacher.
          </span>
        </p>
      </div>
    </div>
  );
}
