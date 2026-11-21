// lib/env.ts
// Environment variable validation.
// Throws at startup if required variables are missing.
// Import this in lib/supabase/server.ts or server-only entry points.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Add it to your .env.local file (see .env.example for reference).`
    );
  }
  return value;
}

export const env = {
  // Public — safe to expose in browser
  NEXT_PUBLIC_SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Server-only — NEVER prefix with NEXT_PUBLIC_
  // This variable is validated lazily in createServerAdminClient()
  // so that it doesn't break browser-only imports.
} as const;
