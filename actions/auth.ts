// actions/auth.ts
// Server Actions for authentication (login and logout).
// Fully migrated to support workspace-aware student logins alongside legacy compatibility
// and teacher authentication, with two-tier (Account + IP) distributed rate limiting
// and strict fail-closed anti-enumeration defenses.

"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerClient, createServerAdminClient } from "@/lib/supabase/server";
import { loginSchema, registerTeacherSchema } from "@/lib/validators/auth";
import { adminLoginSchema } from "@/lib/validators/admin";
import { getCanonicalEmailHash, canonicalizeEmail } from "@/lib/auth/canonical";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  extractTrustedClientIp,
  ACCOUNT_RATE_LIMIT_OPTIONS,
  IP_RATE_LIMIT_OPTIONS,
} from "@/lib/auth/rate-limit";
import {
  STUDENT_EMAIL_DOMAIN,
  ROLES,
  ROLE_HOME,
  LOGIN_PATH,
  DISABLED_PATH,
  ADMIN_DASHBOARD_PATH,
} from "@/lib/constants";
import type { ActionResult } from "@/types";

// ─── Rate Limiting Configuration ──────────────────────────────────────────────
// Account and IP rate limit options are defined in @/lib/auth/rate-limit

/**
 * Resolves the client IP address from trusted edge headers.
 * Returns null if no trustworthy client IP can be established.
 */
async function getTrustedClientIp(): Promise<string | null> {
  try {
    const headerStore = await headers();
    return extractTrustedClientIp(headerStore);
  } catch {
    // Non-fatal if headers unavailable (e.g. testing)
    return null;
  }
}

/**
 * Logs in a teacher (real email) or student (workspace-scoped or default-workspace username).
 * Protects against credential stuffing and username harvesting via two-tier rate limiting.
 */
export async function login(
  _prevState: ActionResult<string> | null,
  formData: FormData
): Promise<ActionResult<string>> {
  const rawWorkspace = formData.get("workspace");
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");

  const parseResult = loginSchema.safeParse({
    workspace: typeof rawWorkspace === "string" ? rawWorkspace : undefined,
    username: typeof rawUsername === "string" ? rawUsername : "",
    password: typeof rawPassword === "string" ? rawPassword : "",
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid login credentials",
    };
  }

  const { workspace, username, password } = parseResult.data;
  const cleanUsername = username.normalize("NFKC").trim().toLowerCase();
  const cleanWorkspace = workspace ? workspace.normalize("NFKC").trim().toLowerCase() : "";
  const isTeacherLogin = cleanUsername.includes("@");

  // 1. Establish Two-Tier Rate Limit Keys
  // Account bucket: strictly scoped by target account (workspace + username, or teacher email)
  const accountKey = isTeacherLogin
    ? `acct:teacher:${cleanUsername}`
    : `acct:${cleanWorkspace || "default"}:${cleanUsername}`;

  // IP bucket: network-level identifier if trusted IP is available
  const clientIp = await getTrustedClientIp();
  const ipKey = clientIp ? `ip:${clientIp}` : null;

  // Helper to record failed attempts on both tiers
  const recordAuthFailure = async () => {
    await Promise.all([
      recordFailedAttempt(accountKey, ACCOUNT_RATE_LIMIT_OPTIONS),
      ipKey ? recordFailedAttempt(ipKey, IP_RATE_LIMIT_OPTIONS) : Promise.resolve(),
    ]);
  };

  // 2. Check Account-Tier Rate Limit (Fail-Closed)
  const accountStatus = await checkRateLimit(accountKey, ACCOUNT_RATE_LIMIT_OPTIONS);
  if (!accountStatus.allowed) {
    if (accountStatus.error === "RATE_LIMIT_SERVICE_UNAVAILABLE") {
      return {
        success: false,
        data: null,
        error: "Authentication service temporarily unavailable. Please try again later.",
      };
    }
    const waitTime = accountStatus.retryAfterSeconds ?? ACCOUNT_RATE_LIMIT_OPTIONS.lockoutSeconds;
    return {
      success: false,
      data: null,
      error: `Too many login attempts on this account. Please wait ${waitTime} seconds before trying again.`,
    };
  }

  // 3. Check IP-Tier Rate Limit (Fail-Closed, if IP is available)
  if (ipKey) {
    const ipStatus = await checkRateLimit(ipKey, IP_RATE_LIMIT_OPTIONS);
    if (!ipStatus.allowed) {
      if (ipStatus.error === "RATE_LIMIT_SERVICE_UNAVAILABLE") {
        return {
          success: false,
          data: null,
          error: "Authentication service temporarily unavailable. Please try again later.",
        };
      }
      const waitTime = ipStatus.retryAfterSeconds ?? IP_RATE_LIMIT_OPTIONS.lockoutSeconds;
      return {
        success: false,
        data: null,
        error: `Too many login attempts from your network. Please wait ${waitTime} seconds before trying again.`,
      };
    }
  }

  const supabase = await createServerClient();
  let targetAuthEmail: string;
  let resolvedTenantId: string | null = null;
  const genericErrorMessage = "Invalid workspace, username, or password";

  // 4. Identify and Resolve Authentication Identity
  if (isTeacherLogin) {
    // Teacher flow: direct email sign-in
    targetAuthEmail = cleanUsername;
  } else {
    // Student flow: workspace-aware synthetic identity resolution
    const adminClient = createServerAdminClient();

    if (cleanWorkspace) {
      // Flow A: Explicit Workspace Slug provided
      let authEmailFromDb: string | null = null;

      try {
        interface RpcCaller {
          rpc(
            fn: string,
            args: Record<string, string>
          ): Promise<{ data: unknown; error: unknown }>;
        }
        const { data: rpcEmail, error: rpcErr } = await (
          adminClient as unknown as RpcCaller
        ).rpc("resolve_student_auth_email", {
          p_workspace_slug: cleanWorkspace,
          p_username: cleanUsername,
        });
        if (!rpcErr && typeof rpcEmail === "string") {
          authEmailFromDb = rpcEmail;
        }
      } catch {
        // Fallback to direct query below
      }

      if (!authEmailFromDb) {
        // Direct query through admin client enforcing active workspace
        const { data: tenantData } = await adminClient
          .from("tenants")
          .select("id, is_active")
          .ilike("slug", cleanWorkspace)
          .maybeSingle();

        if (!tenantData || !tenantData.is_active) {
          await recordAuthFailure();
          return {
            success: false,
            data: null,
            error: genericErrorMessage,
          };
        }

        resolvedTenantId = tenantData.id;

        const { data: identityData } = await adminClient
          .from("student_identities")
          .select("auth_email")
          .eq("tenant_id", tenantData.id)
          .ilike("username", cleanUsername)
          .maybeSingle();

        if (!identityData || !identityData.auth_email) {
          await recordAuthFailure();
          return {
            success: false,
            data: null,
            error: genericErrorMessage,
          };
        }

        authEmailFromDb = identityData.auth_email;
      }

      targetAuthEmail = authEmailFromDb;
    } else {
      // Flow B: No Workspace provided (Legacy Default-Workspace Compatibility)
      let fallbackEmail: string | null = null;

      const { data: defaultTenant } = await adminClient
        .from("tenants")
        .select("id, is_active")
        .eq("slug", "default-workspace")
        .maybeSingle();

      if (defaultTenant && defaultTenant.is_active) {
        resolvedTenantId = defaultTenant.id;
        const { data: identityData } = await adminClient
          .from("student_identities")
          .select("auth_email")
          .eq("tenant_id", defaultTenant.id)
          .ilike("username", cleanUsername)
          .maybeSingle();

        if (identityData?.auth_email) {
          fallbackEmail = identityData.auth_email;
        }
      }

      // If not in default-workspace mapping, fallback to legacy email pattern
      targetAuthEmail = fallbackEmail ?? `${cleanUsername}@${STUDENT_EMAIL_DOMAIN}`;
    }
  }

  // 5. Authenticate with Supabase Auth (Synthetic email never leaked to client)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: targetAuthEmail,
    password,
  });

  if (authError || !authData.user) {
    if (authError?.message?.toLowerCase().includes("email not confirmed")) {
      return {
        success: false,
        data: null,
        error: "Please verify your email address before logging in. We have sent a confirmation link to your inbox.",
      };
    }
    await recordAuthFailure();
    return {
      success: false,
      data: null,
      error: genericErrorMessage,
    };
  }

  // 6. Retrieve Profile & Verify Role and Active Status
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, full_name")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    await recordAuthFailure();
    return {
      success: false,
      data: null,
      error: "User profile not found. Please contact your instructor.",
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect(DISABLED_PATH);
  }

  // Check if user is a platform administrator (super-admin access)
  const adminClient = createServerAdminClient();
  const { data: adminRecord } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (adminRecord) {
    await resetRateLimit(accountKey);
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    cookieStore.set("edvora-role", ROLES.ADMIN, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.set("edvora-active", "1", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    redirect(ADMIN_DASHBOARD_PATH);
  }

  // If user is a teacher, verify their approved workspace membership
  if (profile.role === ROLES.TEACHER) {
    const { data: membership } = await adminClient
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", authData.user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      // Teacher has no provisioned workspace: query teacher application status
      const { data: application } = await adminClient
        .from("teacher_applications")
        .select("status, review_notes")
        .eq("user_id", authData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase.auth.signOut();

      if (application) {
        if (application.status === "pending") {
          return {
            success: false,
            data: null,
            error: "Your teacher application is currently under review by Edvora administration. You will receive access once approved.",
          };
        } else if (application.status === "rejected") {
          const reason = application.review_notes ? `: ${application.review_notes}` : ".";
          return {
            success: false,
            data: null,
            error: `Your teacher application was not approved${reason} Please contact support if you believe this is in error.`,
          };
        }
      }

      return {
        success: false,
        data: null,
        error: "No active tuition workspace found for this account. Please register or contact Edvora administration.",
      };
    } else {
      resolvedTenantId = membership.tenant_id;
    }
  }

  // 7. Reset the Account Bucket on Successful Authentication
  // NOTE: The IP bucket is deliberately NOT reset here. Resetting the IP bucket on a single
  // successful login would allow a password-spraying attacker who successfully compromised
  // one account to immediately reset their IP quota and continue spraying other accounts.
  await resetRateLimit(accountKey);

  // 8. Establish Session Cookies & Navigation Redirection
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set("edvora-role", profile.role, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  cookieStore.set("edvora-active", profile.is_active ? "1" : "0", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  if (resolvedTenantId) {
    cookieStore.set("edvora-tenant", resolvedTenantId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const targetPath =
    profile.role === ROLES.TEACHER
      ? ROLE_HOME[ROLES.TEACHER]
      : ROLE_HOME[ROLES.STUDENT];

  redirect(targetPath);
}

/**
 * Signs the user out, clearing session and hint cookies, and redirects to /login.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("edvora-role");
  cookieStore.delete("edvora-active");
  cookieStore.delete("edvora-tenant");

  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

/**
 * Registers a new tuition teacher account.
 * Phase 3B2-C.1 Security Architecture:
 * - Enforces provider-aware email canonicalization (SEC-3B2C-HIGH-01) to defeat trial abuse.
 * - Removes email_confirm: true bypass (SEC-3B2C-CRIT-01); enforces email ownership verification.
 * - Stage 1: Registers user via Supabase Auth without provisioning workspace or trial claim.
 * - Stage 2: When confirmed, workspace and trial are provisioned atomically via PostgreSQL RPC.
 */
export async function registerTeacher(
  _prevState: ActionResult<{
    tenantId?: string;
    slug?: string;
    pendingVerification?: boolean;
    email?: string;
  }> | null,
  formData: FormData
): Promise<
  ActionResult<{
    tenantId?: string;
    slug?: string;
    pendingVerification?: boolean;
    email?: string;
  }>
> {
  const rawFullName = formData.get("fullName");
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const rawPhoneNumber = formData.get("phoneNumber");
  const rawWorkspaceName = formData.get("workspaceName");
  const rawWorkspaceSlug = formData.get("workspaceSlug");

  const parseResult = registerTeacherSchema.safeParse({
    fullName: typeof rawFullName === "string" ? rawFullName : "",
    email: typeof rawEmail === "string" ? rawEmail : "",
    password: typeof rawPassword === "string" ? rawPassword : "",
    phoneNumber: typeof rawPhoneNumber === "string" ? rawPhoneNumber : undefined,
    workspaceName: typeof rawWorkspaceName === "string" ? rawWorkspaceName : "",
    workspaceSlug:
      typeof rawWorkspaceSlug === "string" && rawWorkspaceSlug.trim() !== ""
        ? rawWorkspaceSlug
        : undefined,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid registration details",
    };
  }

  const { fullName, email, password, phoneNumber, workspaceName, workspaceSlug } = parseResult.data;
  const cleanEmail = email.trim().toLowerCase();
  // Provider-aware canonicalization & hashing (SEC-3B2C-HIGH-01)
  const canonicalEmail = canonicalizeEmail(cleanEmail);
  const canonicalEmailHash = getCanonicalEmailHash(cleanEmail);

  // Generate or sanitize slug
  const cleanSlug = workspaceSlug
    ? workspaceSlug.toLowerCase().trim()
    : workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `workspace-${Date.now()}`;

  // 1. IP Rate Limiting for Registration
  const clientIp = await getTrustedClientIp();
  const regIpKey = clientIp ? `ip:${clientIp}:register` : `ip:unknown:register`;
  const rateLimitStatus = await checkRateLimit(regIpKey, {
    maxAttempts: 5,
    windowSeconds: 300,
    lockoutSeconds: 300,
  });

  if (!rateLimitStatus.allowed) {
    return {
      success: false,
      data: null,
      error: "Too many registration attempts from this network. Please try again later.",
    };
  }

  const adminClient = createServerAdminClient();

  // 2. Pre-check: Duplicate slug in tenants
  const { data: existingTenant } = await adminClient
    .from("tenants")
    .select("id")
    .eq("slug", cleanSlug)
    .maybeSingle();

  if (existingTenant) {
    return {
      success: false,
      data: null,
      error: "Workspace identifier is already taken. Please choose another name or identifier.",
    };
  }

  // Pre-check: Existing application for canonical identity
  const { data: existingApp } = await adminClient
    .from("teacher_applications")
    .select("status")
    .eq("canonical_email_hash", canonicalEmailHash)
    .maybeSingle();

  if (existingApp) {
    if (existingApp.status === "pending") {
      return {
        success: false,
        data: null,
        error: "An onboarding application for this email address is already under review.",
      };
    } else if (existingApp.status === "approved") {
      return {
        success: false,
        data: null,
        error: "An account for this email address has already been approved. Please log in.",
      };
    }
  }

  // 3. Stage 1: Create Supabase Auth User with Email Verification Required (SEC-3B2C-CRIT-01)
  const supabase = await createServerClient();
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: fullName,
        role: ROLES.TEACHER,
        phone_number: phoneNumber ?? null,
        pending_workspace_name: workspaceName,
        pending_workspace_slug: cleanSlug,
      },
    },
  });

  if (authErr) {
    if (
      authErr.message?.toLowerCase().includes("already registered") ||
      authErr.message?.toLowerCase().includes("already exists")
    ) {
      return {
        success: false,
        data: null,
        error: "An account with this email address already exists. Please log in.",
      };
    }
    return {
      success: false,
      data: null,
      error: authErr.message ?? "Registration failed. Please try again.",
    };
  }

  if (!authData?.user) {
    return {
      success: false,
      data: null,
      error: "Failed to initiate registration. Please check your details.",
    };
  }

  // SEC-3B2C2-MED-02: Protect existing user profiles from tampering on duplicate registration.
  // When email enumeration defense is enabled in Supabase Auth, duplicate sign-up returns an obfuscated user with identities: [].
  // Never upsert or mutate profiles, tenants, or trial claims for an existing user identity.
  if (authData.user.identities && authData.user.identities.length === 0) {
    return {
      success: true,
      data: {
        pendingVerification: true,
        email: cleanEmail,
      },
      error: null,
    };
  }

  // Create or upsert teacher profile strictly for verified new registrations
  await adminClient.from("profiles").upsert({
    id: authData.user.id,
    full_name: fullName,
    role: ROLES.TEACHER,
    phone: phoneNumber ?? null,
    is_active: true,
  });

  // Record pending teacher application in teacher_applications table
  // Workspace and trial are strictly decoupled from registration and require admin approval
  await adminClient.from("teacher_applications").upsert(
    {
      user_id: authData.user.id,
      email: cleanEmail,
      canonical_email: canonicalEmail,
      canonical_email_hash: canonicalEmailHash,
      full_name: fullName,
      phone_number: phoneNumber ?? null,
      institute_name: workspaceName,
      workspace_slug: cleanSlug,
      status: "pending",
    },
    { onConflict: "canonical_email_hash" }
  );

  // Clear any active session created during sign-up
  await supabase.auth.signOut();

  return {
    success: true,
    data: {
      pendingVerification: true,
      email: cleanEmail,
    },
    error: null,
  };
}

/**
 * Resends a sign-up verification confirmation email to a teacher.
 */
export async function resendVerificationEmail(
  email: string
): Promise<ActionResult<{ sent: boolean }>> {
  if (!email || typeof email !== "string") {
    return {
      success: false,
      data: null,
      error: "Email address is required",
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const supabase = await createServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: cleanEmail,
  });

  if (error) {
    return {
      success: false,
      data: null,
      error: error.message || "Failed to resend confirmation email",
    };
  }

  return {
    success: true,
    data: { sent: true },
    error: null,
  };
}

/**
 * Logs in a platform administrator.
 * Enforces strict database verification against public.platform_admins.
 */
export async function adminLogin(
  _prevState: ActionResult<string> | null,
  formData: FormData
): Promise<ActionResult<string>> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  const parseResult = adminLoginSchema.safeParse({
    email: typeof rawEmail === "string" ? rawEmail : "",
    password: typeof rawPassword === "string" ? rawPassword : "",
  });

  if (!parseResult.success) {
    return {
      success: false,
      data: null,
      error: parseResult.error.issues[0]?.message ?? "Invalid administrator credentials",
    };
  }

  const { email, password } = parseResult.data;
  const cleanEmail = email.trim().toLowerCase();
  const accountKey = `acct:admin:${cleanEmail}`;
  const clientIp = await getTrustedClientIp();
  const ipKey = clientIp ? `ip:${clientIp}` : null;

  // Account rate limit
  const accountStatus = await checkRateLimit(accountKey, ACCOUNT_RATE_LIMIT_OPTIONS);
  if (!accountStatus.allowed) {
    return {
      success: false,
      data: null,
      error: "Too many login attempts on this administrative account. Please try again later.",
    };
  }

  const supabase = await createServerClient();
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (authErr || !authData.user) {
    await Promise.all([
      recordFailedAttempt(accountKey, ACCOUNT_RATE_LIMIT_OPTIONS),
      ipKey ? recordFailedAttempt(ipKey, IP_RATE_LIMIT_OPTIONS) : Promise.resolve(),
    ]);
    return {
      success: false,
      data: null,
      error: "Invalid administrator credentials",
    };
  }

  // Authoritative Platform Admin Database Verification
  const adminClient = createServerAdminClient();
  const { data: adminRecord } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!adminRecord) {
    await supabase.auth.signOut();
    await Promise.all([
      recordFailedAttempt(accountKey, ACCOUNT_RATE_LIMIT_OPTIONS),
      ipKey ? recordFailedAttempt(ipKey, IP_RATE_LIMIT_OPTIONS) : Promise.resolve(),
    ]);
    return {
      success: false,
      data: null,
      error: "Access denied. Platform administrator authorization required.",
    };
  }

  await resetRateLimit(accountKey);

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  cookieStore.set("edvora-role", ROLES.ADMIN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.set("edvora-active", "1", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(ADMIN_DASHBOARD_PATH);
}

/**
 * Dedicated teacher login portal action.
 */
export async function teacherLogin(
  prevState: ActionResult<string> | null,
  formData: FormData
): Promise<ActionResult<string>> {
  return login(prevState, formData);
}

/**
 * Dedicated student login portal action.
 */
export async function studentLogin(
  prevState: ActionResult<string> | null,
  formData: FormData
): Promise<ActionResult<string>> {
  return login(prevState, formData);
}
