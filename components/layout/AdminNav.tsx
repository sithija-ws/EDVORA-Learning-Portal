// components/layout/AdminNav.tsx
// Studio-grade platform administration navigation bar.

"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, LogOut } from "lucide-react";
import { logout } from "@/actions/auth";

export function AdminNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Edvora"
              className="h-8 w-8 object-contain"
            />
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-foreground leading-none">
                Edvora
              </span>
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                Central Operations
              </span>
            </div>
          </Link>

          {/* Admin Badge */}
          <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Platform Admin</span>
          </div>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-2">
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-xs font-semibold text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
