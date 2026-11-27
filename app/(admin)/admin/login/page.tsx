// app/(admin)/admin/login/page.tsx
// Platform administrator authentication portal.

import type { Metadata } from "next";
import { AdminLoginForm } from "./_components/AdminLoginForm";
import { CreditsFooter } from "@/components/layout/CreditsFooter";

export const metadata: Metadata = {
  title: "Platform Administration Sign In – Edvora",
  description: "Secure administrator sign in for Edvora platform governance.",
};

export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Blueprint technical coordinate grid background */}
      <div
        className="pointer-events-none absolute inset-0 bg-tech-grid opacity-35"
        aria-hidden="true"
      />

      {/* Subtle ambient lighting */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="space-y-3 text-center">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center transition-transform hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Edvora"
              className="h-16 w-16 object-contain drop-shadow-md"
            />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Edvora Platform Console
            </h1>
            <p className="text-xs text-muted-foreground">
              Authorized personnel only. Enter your administrator credentials.
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-3xl border border-border/80 bg-card/90 p-6 sm:p-7 shadow-xl shadow-black/5 backdrop-blur-xl">
          <AdminLoginForm />
        </div>

        {/* Minimal Footer */}
        <div className="pt-2">
          <CreditsFooter variant="minimal" />
        </div>
      </div>
    </div>
  );
}
