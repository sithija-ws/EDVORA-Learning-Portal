// lib/supabase/middleware.ts
// Supabase session refresh helper for Next.js middleware.
//
// This must be called in middleware.ts on every request to keep the
// user's JWT access token fresh. If not called, sessions will expire
// and users will be logged out unexpectedly after 1 hour.
//
// See: https://supabase.com/docs/guides/auth/server-side/nextjs

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Set cookies on the request (for downstream middleware/handlers)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Recreate the response with updated cookies
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Fast local session verification: decodes JWT locally in memory (0ms)
  // instead of making an external HTTPS roundtrip across the ocean.
  // When the JWT is near expiration, getSession() automatically triggers
  // refresh and setAll updates cookies.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;

  return { supabaseResponse, user, supabase };
}
