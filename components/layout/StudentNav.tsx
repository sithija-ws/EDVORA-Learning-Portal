// components/layout/StudentNav.tsx
// Modern, tactile student navigation — desktop top bar + floating mobile dock.
// Uses usePathname() for instant active-state micro-interactions.

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Bell, LogOut, FileText } from "lucide-react";
import { logout } from "@/actions/auth";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home, exact: true },
  { href: "/home/lessons", label: "Lessons", icon: BookOpen, exact: false },
  { href: "/home/notes", label: "Notes", icon: FileText, exact: false },
  { href: "/home/announcements", label: "Notices", icon: Bell, exact: false },
];

export function StudentNav() {
  const pathname = usePathname();

  const isItemActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* ── Desktop Header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 hidden border-b border-border/80 bg-card/90 backdrop-blur-md sm:block">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          {/* Brand mark */}
          <Link
            href="/home"
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
                Student Portal
              </span>
            </div>
          </Link>

          {/* Nav Pills */}
          <nav className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/50" aria-label="Student navigation">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
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

          {/* User Sign Out */}
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-xs font-semibold text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </header>

      {/* ── Mobile Top Header (Brand & Telemetry Status) ─────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/90 backdrop-blur-md sm:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <Link href="/home" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Edvora"
              className="h-7 w-7 object-contain"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-black tracking-tight">Edvora</span>
              <span className="text-[10px] font-mono text-muted-foreground">STUDENT</span>
            </div>
          </Link>

          <form action={logout}>
            <button
              type="submit"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </header>

      {/* ── Mobile Floating Modern Dock Navigation ───────────────── */}
      <nav
        className="fixed bottom-3 inset-x-4 z-50 mx-auto max-w-sm sm:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex h-14 items-center justify-around rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const active = isItemActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px] font-bold transition-all duration-200 active:scale-95 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
                <span className="text-[10px] tracking-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
