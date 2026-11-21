// components/layout/StudentNav.tsx
// Student navigation — desktop top bar + mobile bottom bar.
// Touch targets ≥ 44×44px on mobile for accessibility.

import React from "react";
import Link from "next/link";
import { Home, BookOpen, Bell, LogOut } from "lucide-react";
import { logout } from "@/actions/auth";

export function StudentNav() {
  return (
    <>
      {/* Desktop Header */}
      <header className="sticky top-0 z-40 hidden border-b bg-card/95 backdrop-blur-xs sm:block">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/home"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              E
            </span>
            <span>Edvora</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Student navigation">
            <Link
              href="/home"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Link>
            <Link
              href="/home/lessons"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
              <span>Lessons</span>
            </Link>
            <Link
              href="/home/announcements"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              <span>Announcements</span>
            </Link>
          </nav>

          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </header>

      {/* Mobile Top Bar (Brand only) */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xs sm:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <Link
            href="/home"
            className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              E
            </span>
            <span>Edvora</span>
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (≥ 44px tap targets) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xs sm:hidden"
        aria-label="Mobile navigation"
      >
        <div className="grid h-14 grid-cols-3 items-center">
          <Link
            href="/home"
            className="flex h-full min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:text-primary"
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </Link>

          <Link
            href="/home/lessons"
            className="flex h-full min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:text-primary"
          >
            <BookOpen className="h-5 w-5" />
            <span>Lessons</span>
          </Link>

          <Link
            href="/home/announcements"
            className="flex h-full min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground active:text-primary"
          >
            <Bell className="h-5 w-5" />
            <span>Announce</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
