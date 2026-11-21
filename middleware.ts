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
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublicRoute =
    pathname === LOGIN_PATH || pathname === DISABLED_PATH;

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
