// actions/auth.ts
// Server Actions for authentication (login and logout).
// Runs only on the server — never exposes keys to the client.

"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validators/auth";
import {
  STUDENT_EMAIL_DOMAIN,
  ROLES,
  ROLE_HOME,
  LOGIN_PATH,
  DISABLED_PATH,
} from "@/lib/constants";
import type { ActionResult } from "@/types";

/**
 * Logs in a teacher (real email) or student (username).
 * Appends @edvora.internal if no '@' symbol is present.
 */
export async function login(
  _prevState: ActionResult<string> | null,
  formData: FormData
): Promise<ActionResult<string>> {
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");

  const parseResult = loginSchema.safeParse({
    username: rawUsername,
    password: rawPassword,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid username or password",
    };
  }

  const { username, password } = parseResult.data;

  // If the user entered a real email (contains @), use it directly (teacher).
  // Otherwise, synthesize the student internal email identifier.
  const email = username.includes("@")
    ? username
    : `${username}@${STUDENT_EMAIL_DOMAIN}`;

  const supabase = await createServerClient();

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (authError || !authData.user) {
    console.error("Login attempt failed:", authError?.message);
    // Return a generic error to prevent username enumeration
    return {
      success: false,
      data: null,
      error: "Invalid username or password",
    };
  }

  // Fetch user profile to determine role and active status
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    console.error("Profile lookup failed:", profileError?.message);
    await supabase.auth.signOut();
    return {
      success: false,
      data: null,
      error: "User profile not found. Please contact your teacher.",
    };
  }

  // If account is deactivated, sign out and send to disabled page
  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect(DISABLED_PATH);
  }

  const targetPath =
    profile.role === ROLES.TEACHER
      ? ROLE_HOME[ROLES.TEACHER]
      : ROLE_HOME[ROLES.STUDENT];

  const cookieStore = await cookies();
  cookieStore.set("edvora-role", profile.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.set("edvora-active", profile.is_active ? "1" : "0", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(targetPath);
}

/**
 * Signs the user out, clearing the HTTP-only session cookie,
 * and redirects to /login.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("edvora-role");
  cookieStore.delete("edvora-active");
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
