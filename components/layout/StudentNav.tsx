// components/layout/StudentNav.tsx
// Student navigation — desktop top bar + mobile bottom bar.
// Touch targets ≥ 44×44px. Warm amber accent, non-AI palette.

import React from "react";
import Link from "next/link";
import { Home, BookOpen, Bell, LogOut } from "lucide-react";
import { logout } from "@/actions/auth";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/home/lessons", label: "Lessons", icon: BookOpen },
  { href: "/home/announcements", label: "Notices", icon: Bell },
];

export function StudentNav() {
  return (
    <>
      {/* ── Desktop Header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 hidden border-b border-border bg-card/95 backdrop-blur-sm sm:block">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/home"
            className="flex items-center gap-2.5 text-foreground"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm select-none">
              E
            </span>
            <span className="text-base font-black tracking-tight text-foreground">
              Edvora
            </span>
          </Link>

          <nav className="flex items-center gap-0.5" aria-label="Student navigation">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </header>

      {/* ── Mobile Top Bar (Brand + Logout only) ─────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm sm:hidden">
        <div className="flex h-13 items-center justify-between px-4">
          <Link
            href="/home"
            className="flex items-center gap-2 text-foreground"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground select-none">
              E
            </span>
            <span className="text-sm font-black tracking-tight">Edvora</span>
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>

      {/* ── Mobile Bottom Navigation Bar (≥ 44px tap targets) ───── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
        aria-label="Mobile navigation"
      >
        <div className="grid h-14 grid-cols-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary active:text-primary"
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
