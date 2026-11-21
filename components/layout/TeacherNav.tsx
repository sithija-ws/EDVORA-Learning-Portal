// components/layout/TeacherNav.tsx
// Teacher navigation header — responsive for desktop and mobile.

import React from "react";
import Link from "next/link";
import { BookOpen, Users, LogOut } from "lucide-react";
import { logout } from "@/actions/auth";

export function TeacherNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xs">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo / Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              E
            </span>
            <span>Edvora</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Teacher
            </span>
          </Link>

          {/* Desktop Links */}
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Users className="h-4 w-4" />
              <span>Batches</span>
            </Link>
            <Link
              href="/dashboard/lessons"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
              <span>Lessons</span>
            </Link>
          </nav>
        </div>

        {/* User / Logout */}
        <div className="flex items-center gap-2">
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
