// components/layout/TeacherNav.tsx
// Teacher navigation header — clean, editorial, non-AI aesthetic.

import React from "react";
import Link from "next/link";
import { BookOpen, Users, Megaphone, LogOut } from "lucide-react";
import { logout } from "@/actions/auth";

const NAV_LINKS = [
  { href: "/dashboard", label: "Batches", icon: Users },
  { href: "/dashboard/lessons", label: "Lessons", icon: BookOpen },
  { href: "/dashboard/announcements", label: "Notices", icon: Megaphone },
];

export function TeacherNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo / Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-foreground"
          >
            {/* Logomark: bold "E" in primary orange */}
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm select-none">
              E
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black tracking-tight text-foreground">
                Edvora
              </span>
              <span className="hidden rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:inline-block">
                Teacher
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Teacher navigation">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
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
        </div>

        {/* Sign Out */}
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>

      {/* Mobile Bottom Nav for Teacher */}
      <nav
        className="flex items-center justify-around border-t bg-card sm:hidden"
        aria-label="Mobile teacher navigation"
      >
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary active:text-primary"
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
