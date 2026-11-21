// lib/supabase/client.ts
// Browser-side Supabase client.
//
// Use this client in Client Components ('use client') only.
// It uses the ANON key — safe to expose in the browser.
// RLS policies control what data this client can access.
//
// Usage:
//   import { createBrowserClient } from '@/lib/supabase/client'
//   const supabase = createBrowserClient()

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createBrowserClient() {
  return createSupabaseBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
