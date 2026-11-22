// components/layout/TeacherNav.tsx
// Studio-grade teacher navigation with active state indicators.

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Users, Megaphone, LogOut, FileText } from "lucide-react";
import { logout } from "@/actions/auth";

const NAV_LINKS = [
  { href: "/dashboard", label: "Batches", icon: Users, exact: true },
  { href: "/dashboard/lessons", label: "Lessons", icon: BookOpen, exact: false },
  { href: "/dashboard/notes", label: "Notes", icon: FileText, exact: false },
  { href: "/dashboard/announcements", label: "Notices", icon: Megaphone, exact: false },
];

export function TeacherNav() {
  const pathname = usePathname();

  const isItemActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm">
              <span>E</span>
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-foreground leading-none">
                Edvora
              </span>
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                Instructor Console
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links with active pills */}
          <nav className="hidden items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/50 sm:flex" aria-label="Teacher navigation">
            {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
              const active = isItemActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
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

      {/* Mobile Top Secondary Tab Row */}
      <nav
        className="flex items-center justify-around border-t border-border/60 bg-card p-1 sm:hidden"
        aria-label="Mobile teacher navigation"
      >
        {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = isItemActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${
                active
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
