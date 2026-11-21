// middleware.ts
// Next.js Edge Middleware — runs on every request before the page renders.
//
// Responsibilities:
//   1. Refresh the Supabase Auth session cookie (keep JWTs fresh)
//   2. Redirect unauthenticated users to /login
//   3. Redirect authenticated users to the correct area based on role
//   4. Block deactivated students (is_active = false)
//
// NOTE (Milestone 0):
//   Full auth guard logic is implemented in Milestone 1.
//   This stub only refreshes the session and passes all requests through.
//   Do not add feature logic here until the Supabase client is installed.

import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Session refresh and role-based routing implemented in Milestone 1
  // once @supabase/ssr is installed and configured.
  return NextResponse.next({ request });
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
