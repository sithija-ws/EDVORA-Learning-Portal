// app/(auth)/teacher/login/page.tsx
// Dedicated login portal for tuition teachers.

import type { Metadata } from "next";
import { TeacherLoginForm } from "./_components/TeacherLoginForm";
import { CreditsFooter } from "@/components/layout/CreditsFooter";

export const metadata: Metadata = {
  title: "Teacher Sign In – Edvora Instructor Console",
  description: "Sign in to manage your tuition batches, video lessons, study notes, notices, and billing.",
};

export default function TeacherLoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Background blueprint grid */}
      <div className="pointer-events-none absolute inset-0 bg-tech-grid opacity-35" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />

      <div className="relative w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="space-y-3 text-center">
          <div className="relative mx-auto flex h-14 w-14 items-center justify-center transition-transform hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Edvora" className="h-14 w-14 object-contain drop-shadow-md" />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Instructor Console
            </h1>
            <p className="text-xs text-muted-foreground">
              Sign in with your verified tuition educator account
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-border/80 bg-card/90 p-6 sm:p-7 shadow-xl shadow-black/5 backdrop-blur-xl">
          <TeacherLoginForm />
        </div>

        <div className="pt-2">
          <CreditsFooter />
        </div>
      </div>
    </div>
  );
}
