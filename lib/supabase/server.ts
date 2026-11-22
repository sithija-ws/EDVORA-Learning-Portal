// lib/supabase/server.ts
// Server-side Supabase clients for use in Server Components, Server Actions,
// and Route Handlers. Never use these in Client Components.
//
// Two clients are exported:
//
//   createServerClient()
//     - Uses the ANON key + current user's session cookie
//     - Subject to RLS policies
//     - Use for reading data on behalf of the logged-in user
//
//   createServerAdminClient()
//     - Uses the SERVICE ROLE key
//     - Bypasses RLS entirely
//     - Use ONLY for privileged writes (e.g. teacher creating a student account)
//     - Never expose or call from Client Components

import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/types/database";

/**
 * Creates a server-side Supabase client that respects the current user's
 * session (via cookies) and is subject to RLS.
 *
 * Use in: Server Components, Server Actions (reading data)
 */
export async function createServerClient() {
  try {
    await connection();
  } catch {
    // connection() is only active during Server Component rendering; safe to ignore elsewhere
  }

  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll is called from Server Components where cookies cannot be
            // mutated. This is safe to ignore — the middleware handles refresh.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client using the SERVICE ROLE key.
 * This client BYPASSES Row Level Security entirely.
 *
 * Use in: Server Actions only (e.g. teacher creating/deleting student accounts)
 *
 * ⚠️  NEVER import or call this in Client Components or pages with 'use client'.
 * ⚠️  NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createServerAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Check your .env.local file. " +
        "This key must never be prefixed with NEXT_PUBLIC_."
    );
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
