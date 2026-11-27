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
  REGISTER_PATH,
  STUDENT_LOGIN_PATH,
  TEACHER_LOGIN_PATH,
  TEACHER_REGISTER_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_DASHBOARD_PATH,
  PUBLIC_ROUTES,
} from "@/lib/constants";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Canonical Portal Redirects ──────────────────────────────────────────
  if (pathname === "/teacher/dashboard" || pathname.startsWith("/teacher/dashboard/")) {
    const target = pathname.replace(/^\/teacher\/dashboard/, "/dashboard");
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/student/home" || pathname.startsWith("/student/home/")) {
    const target = pathname.replace(/^\/student\/home/, "/home");
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }

  if (pathname === REGISTER_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = TEACHER_REGISTER_PATH;
    return NextResponse.redirect(url, 308);
  }

  const isPublicRoute = (PUBLIC_ROUTES as readonly string[]).includes(pathname);

  // Helper to determine unauthenticated redirect path
  const getUnauthenticatedRedirect = (path: string): string => {
    if (path === "/admin" || path.startsWith("/admin/")) return ADMIN_LOGIN_PATH;
    if (path === "/dashboard" || path.startsWith("/dashboard/")) return TEACHER_LOGIN_PATH;
    if (path === "/home" || path.startsWith("/home/")) return STUDENT_LOGIN_PATH;
    return LOGIN_PATH;
  };

  // ── Performance Fast-Path 1: No Session Cookies ──────────────────────────
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAuthCookie) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = getUnauthenticatedRedirect(pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Performance Fast-Path 2: Server Action Requests ──────────────────────
  if (request.headers.get("next-action")) {
    return NextResponse.next();
  }

  // ── Performance Fast-Path 3: Cached Role in Cookie ───────────────────────
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

    const homePath =
      cachedRole === ROLES.ADMIN
        ? ADMIN_DASHBOARD_PATH
        : cachedRole === ROLES.TEACHER
        ? ROLE_HOME[ROLES.TEACHER]
        : ROLE_HOME[ROLES.STUDENT];

    // If active user visits a public route or root, redirect to their home
    if (isPublicRoute || pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = homePath;
      return NextResponse.redirect(url);
    }

    // Role-based route containment
    if (cachedRole === ROLES.ADMIN) {
      if (pathname === "/home" || pathname.startsWith("/home/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
        const url = request.nextUrl.clone();
        url.pathname = ADMIN_DASHBOARD_PATH;
        return NextResponse.redirect(url);
      }
    } else if (cachedRole === ROLES.TEACHER) {
      if (pathname === "/home" || pathname.startsWith("/home/") || pathname === "/admin" || pathname.startsWith("/admin/")) {
        const url = request.nextUrl.clone();
        url.pathname = ROLE_HOME[ROLES.TEACHER];
        return NextResponse.redirect(url);
      }
    } else if (cachedRole === ROLES.STUDENT) {
      if (pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/")) {
        const url = request.nextUrl.clone();
        url.pathname = ROLE_HOME[ROLES.STUDENT];
        return NextResponse.redirect(url);
      }
    }

    // Role is valid and matches path: update session and proceed
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // ── Fallback: Database Profile & Platform Admin Lookup ────────────────────
  const { supabaseResponse, user, supabase } = await updateSession(request);

  // 1. Unauthenticated users
  if (!user) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = getUnauthenticatedRedirect(pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 2. Authenticated users: fetch profile and platform admin status
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile) {
    if (!isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = getUnauthenticatedRedirect(pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Check if user is a platform administrator
  let effectiveRole: string = profile.role;
  const { data: adminRecord } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminRecord) {
    effectiveRole = ROLES.ADMIN;
  }

  // Cache role for subsequent edge requests
  supabaseResponse.cookies.set("edvora-role", effectiveRole, {
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

  const effectiveHomePath =
    effectiveRole === ROLES.ADMIN
      ? ADMIN_DASHBOARD_PATH
      : effectiveRole === ROLES.TEACHER
      ? ROLE_HOME[ROLES.TEACHER]
      : ROLE_HOME[ROLES.STUDENT];

  // 4. Active authenticated user visiting public route or root
  if (isPublicRoute || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = effectiveHomePath;
    return NextResponse.redirect(url);
  }

  // 5. Cross-role route isolation
  if (effectiveRole === ROLES.ADMIN) {
    if (pathname === "/home" || pathname.startsWith("/home/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
      const url = request.nextUrl.clone();
      url.pathname = ADMIN_DASHBOARD_PATH;
      return NextResponse.redirect(url);
    }
  } else if (effectiveRole === ROLES.TEACHER) {
    if (pathname === "/home" || pathname.startsWith("/home/") || pathname === "/admin" || pathname.startsWith("/admin/")) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[ROLES.TEACHER];
      return NextResponse.redirect(url);
    }
  } else if (effectiveRole === ROLES.STUDENT) {
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/")) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[ROLES.STUDENT];
      return NextResponse.redirect(url);
    }
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
