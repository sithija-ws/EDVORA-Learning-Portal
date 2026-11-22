// app/(auth)/login/page.tsx
// High-precision login portal — technical blueprint grid and tactile credentials form.

import type { Metadata } from "next";
import { LoginForm } from "./_components/LoginForm";
import { ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Sign In – Edvora",
  description: "Sign in to access your Engineering Technology tuition batch.",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Blueprint technical coordinate grid background */}
      <div
        className="pointer-events-none absolute inset-0 bg-tech-grid opacity-40"
        aria-hidden="true"
      />

      {/* Subtle ambient lighting */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="space-y-3 text-center">
          <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground shadow-xl shadow-primary/25 select-none">
            <span>E</span>
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>Tuition Portal v1.0</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Edvora
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Engineering Technology A/L Learning Platform
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-md space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-black tracking-tight text-foreground">
              Sign In to Your Account
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter your student username or teacher email to proceed.
            </p>
          </div>

          <LoginForm />

          {/* Quick Guidance Pill */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Account Types</span>
            </div>
            <p className="leading-relaxed">
              • <strong className="text-foreground">Students</strong>: Use your assigned username (e.g. <span className="font-mono text-[10px] text-primary">kasun-2026</span>)
            </p>
            <p className="leading-relaxed">
              • <strong className="text-foreground">Teacher</strong>: Use your registered email address.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Need account assistance?{" "}
          <span className="font-semibold text-foreground">
            Contact your instructor.
          </span>
        </p>
      </div>
    </div>
  );
}
