// lib/auth/assert.ts
// Shared, high-performance teacher assertion helper for Server Actions.

import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/constants";

/**
 * Asserts the current user has the teacher role.
 * Uses fast local session verification and role cookie first, avoiding unnecessary network roundtrips.
 */
export async function assertTeacher(): Promise<string> {
  const supabase = await createServerClient();

  // Fast-path: read verified session from local cookie (0ms)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? (await supabase.auth.getUser()).data.user;

  if (!user) {
    throw new Error("Unauthorized: Please sign in");
  }

  // Fast-path: check cached role cookie (0ms)
  const cookieStore = await cookies();
  const cachedRole = cookieStore.get("edvora-role")?.value;
  if (cachedRole === ROLES.TEACHER) {
    return user.id;
  }

  // Fallback: verify from database if cookie not present
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== ROLES.TEACHER) {
    throw new Error("Forbidden: Teacher access required");
  }

  return user.id;
}
