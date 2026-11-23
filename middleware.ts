// middleware.ts
// Next.js Edge Middleware — runs on every request before the page renders.
//
// Responsibilities:
//   1. Refresh Supabase session cookie (keeps JWTs fresh)
//   2. Redirect unauthenticated users to /login
//   3. Prevent cross-role access (teachers cannot access /home, students cannot access /dashboard)
//   4. Redirect deactivated students (is_active = false) to /disabled
//   5. Redirect authenticated users away from /login to their role home

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  ROLES,
  ROLE_HOME,
  LOGIN_PATH,
  DISABLED_PATH,
} from "@/lib/constants";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isPublicRoute = pathname === LOGIN_PATH || pathname === DISABLED_PATH;

  // ── Performance Fast-Path 1: No Session Cookies ──────────────────────────
  // If an unauthenticated visitor accesses /login with no cookies, bypass
  // all Supabase Auth network roundtrips completely for instant edge response.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAuthCookie) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Performance Fast-Path 2: Server Action Requests ──────────────────────
  // If this is a Server Action execution (form submit, delete, button press),
  // return immediately without blocking database queries or auth roundtrips.
  // Next.js Server Actions execute in their own server context.
  if (request.headers.get("next-action")) {
    return NextResponse.next();
  }

  // ── Performance Fast-Path 3: Cached Role in Cookie ───────────────────────
  // If the user's role is already cached in the HTTP-only cookie, check routing
  // in 0ms without querying the database `profiles` table!
  const cachedRole = request.cookies.get("edvora-role")?.value;
  const cachedActive = request.cookies.get("edvora-active")?.value;

  if (cachedRole && cachedActive) {
    if (cachedActive !== "1") {
      if (pathname !== DISABLED_PATH) {
        const url = request.nextUrl.clone();
        url.pathname = DISABLED_PATH;
        return NextResponse.redirect(url);
      }
      const { supabaseResponse } = await updateSession(request);
      return supabaseResponse;
    }

    if (isPublicRoute || pathname === "/") {
      const target =
        cachedRole === ROLES.TEACHER
          ? ROLE_HOME[ROLES.TEACHER]
          : ROLE_HOME[ROLES.STUDENT];
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url);
    }

    if (
      cachedRole === ROLES.TEACHER &&
      (pathname === "/home" || pathname.startsWith("/home/"))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[ROLES.TEACHER];
      return NextResponse.redirect(url);
    }

    if (
      cachedRole === ROLES.STUDENT &&
      (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[ROLES.STUDENT];
      return NextResponse.redirect(url);
    }

    // Role is valid and matches path: update session and proceed!
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // ── Fallback: Database Profile Lookup (Only if cookie is missing) ─────────
  const { supabaseResponse, user, supabase } = await updateSession(request);

  // 1. Unauthenticated users
  if (!user) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 2. Authenticated users: fetch profile for role and active status
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  // If user has no profile record (e.g. orphan auth user)
  if (!profile) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Cache role for all subsequent requests
  supabaseResponse.cookies.set("edvora-role", profile.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  supabaseResponse.cookies.set("edvora-active", profile.is_active ? "1" : "0", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  // 3. Deactivated accounts (is_active = false)
  if (!profile.is_active) {
    if (pathname !== DISABLED_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = DISABLED_PATH;
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 4. Active authenticated user visiting /login, /disabled, or root /
  if (isPublicRoute || pathname === "/") {
    const target =
      profile.role === ROLES.TEACHER
        ? ROLE_HOME[ROLES.TEACHER]
        : ROLE_HOME[ROLES.STUDENT];
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  // 5. Cross-role route isolation:
  // Teacher accessing student routes (/home, /home/*)
  if (
    profile.role === ROLES.TEACHER &&
    (pathname === "/home" || pathname.startsWith("/home/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[ROLES.TEACHER];
    return NextResponse.redirect(url);
  }

  // Student accessing teacher routes (/dashboard, /dashboard/*)
  if (
    profile.role === ROLES.STUDENT &&
    (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[ROLES.STUDENT];
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico   (browser favicon)
     * - public assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
