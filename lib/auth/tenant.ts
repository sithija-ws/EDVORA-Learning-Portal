// lib/auth/tenant.ts
// Centralized, Server-Side Multi-Tenant Authorization Engine for Edvora.
//
// ⚠️ ARCHITECTURAL SECURITY RULES:
// 1. Mandatory server-side cryptographic user verification: Call `supabase.auth.getUser()`.
//    NEVER trust `supabase.auth.getSession()` alone for sensitive operations.
// 2. Database-driven membership verification: Query trusted `tenant_members` and `tenants` records.
// 3. Cookie as selection hint ONLY: The `edvora-tenant` cookie is untrusted client state.
//    It is ALWAYS validated against active database memberships before use.
// 4. Safe Multi-Workspace Handling: If a user has multiple active workspaces and has not selected
//    a valid one via cookie, require explicit selection rather than arbitrarily picking one.
// 5. Application permission checks complement, but NEVER replace, database RLS policies.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  can,
  type TenantPermission,
  type TenantRole,
} from "./permissions.ts";
import type { Database } from "@/types/database";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Cookie name used as an untrusted UI selection hint for staff workspace preference.
 */
export const EDVORA_TENANT_COOKIE = "edvora-tenant" as const;

/**
 * Standard UUID regex for validating client cookie format before database queries.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Context & Type Definitions ───────────────────────────────────────────────

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: TenantRole;
  membershipId: string;
  isSubscriptionActive: boolean;
  subscriptionStatus:
    | "pending"
    | "trialing"
    | "active"
    | "expired"
    | "suspended"
    | "pending_payment";
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  isTrial: boolean;
  trialRemainingSeconds: number;
}

export interface AvailableWorkspaceSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  membershipId: string;
}

export type TenantResolutionResult =
  | { status: "resolved"; context: TenantContext }
  | { status: "unauthenticated"; error: string }
  | { status: "inactive_profile"; error: string; userId: string }
  | { status: "no_workspaces"; error: string; userId: string }
  | {
      status: "selection_required";
      error: string;
      userId: string;
      availableWorkspaces: AvailableWorkspaceSummary[];
    };

// ─── Error Hierarchy ──────────────────────────────────────────────────────────

export type TenantAuthErrorCode =
  | "UNAUTHENTICATED"
  | "ACCOUNT_DEACTIVATED"
  | "NO_WORKSPACES"
  | "WORKSPACE_INACTIVE"
  | "SELECTION_REQUIRED"
  | "INSUFFICIENT_PERMISSIONS"
  | "NOT_OWNER"
  | "SUBSCRIPTION_EXPIRED";

/**
 * Structured authorization error thrown by tenant security helpers.
 */
export class TenantAuthError extends Error {
  readonly code: TenantAuthErrorCode;

  constructor(message: string, code: TenantAuthErrorCode) {
    super(message);
    this.name = "TenantAuthError";
    this.code = code;
  }
}

/**
 * Specialized error thrown when a user belongs to multiple active workspaces
 * but has not provided a valid workspace selection hint.
 */
export class WorkspaceSelectionRequiredError extends TenantAuthError {
  readonly availableWorkspaces: AvailableWorkspaceSummary[];

  constructor(availableWorkspaces: AvailableWorkspaceSummary[]) {
    super(
      "Workspace selection required: Multiple active workspaces available",
      "SELECTION_REQUIRED"
    );
    this.name = "WorkspaceSelectionRequiredError";
    this.availableWorkspaces = availableWorkspaces;
  }
}

// ─── Runtime Resolvers ────────────────────────────────────────────────────────

/**
 * Dynamically resolves the Next.js cookie store when running in Next.js server runtime.
 * Returns null when running in non-Next environments (e.g. unit tests).
 */
async function getNextCookieStore() {
  try {
    const nextHeaders = await import("next/headers");
    return await nextHeaders.cookies();
  } catch {
    return null;
  }
}

/**
 * Dynamically resolves the default server Supabase client when not explicitly injected.
 */
async function getDefaultSupabaseClient(): Promise<SupabaseClient<Database>> {
  const { createServerClient } = await import("../supabase/server");
  return await createServerClient();
}

// ─── Cookie Utilities ─────────────────────────────────────────────────────────

/**
 * Validates whether a given string is a syntactically valid UUID.
 */
export function isValidUuid(id: string | null | undefined): id is string {
  if (!id || typeof id !== "string") {
    return false;
  }
  return UUID_REGEX.test(id.trim());
}

/**
 * Extracts and sanitizes the workspace hint cookie.
 * Returns null if missing or not a valid UUID format.
 */
export async function getTenantCookie(
  providedCookieId?: string | null
): Promise<string | null> {
  if (providedCookieId !== undefined) {
    return isValidUuid(providedCookieId) ? providedCookieId.trim() : null;
  }

  const cookieStore = await getNextCookieStore();
  if (!cookieStore) {
    return null;
  }

  const rawVal = cookieStore.get(EDVORA_TENANT_COOKIE)?.value;
  return isValidUuid(rawVal) ? rawVal.trim() : null;
}

/**
 * Sets the `edvora-tenant` workspace hint cookie with strict production security attributes.
 */
export async function setTenantCookie(
  tenantId: string
): Promise<void> {
  if (!isValidUuid(tenantId)) {
    throw new Error("Cannot set invalid UUID as workspace selection cookie");
  }

  const cookieStore = await getNextCookieStore();
  if (!cookieStore) {
    return;
  }

  cookieStore.set(EDVORA_TENANT_COOKIE, tenantId.trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

/**
 * Clears the `edvora-tenant` workspace selection hint cookie.
 */
export async function clearTenantCookie(): Promise<void> {
  const cookieStore = await getNextCookieStore();
  if (cookieStore) {
    try {
      cookieStore.delete(EDVORA_TENANT_COOKIE);
    } catch {
      // Safe to ignore if outside mutable cookie context
    }
  }
}

// ─── Core Authentication & Context Resolution ─────────────────────────────────

/**
 * Retrieves and cryptographically verifies the current authenticated user.
 * Performs an authoritative call to `supabase.auth.getUser()`.
 * Returns null if the user session is missing, expired, or revoked.
 */
export async function getAuthenticatedUser(
  supabaseClient?: SupabaseClient<Database>
): Promise<User | null> {
  const supabase = supabaseClient ?? (await getDefaultSupabaseClient());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export interface TenantContextOptions {
  supabaseClient?: SupabaseClient<Database>;
  cookieTenantId?: string | null;
}

/**
 * Resolves the tenant context for the currently authenticated user.
 *
 * Evaluation Workflow:
 * 1. Cryptographically verify user via `supabase.auth.getUser()`.
 * 2. Query user's `profiles` record to verify `is_active = true`.
 * 3. Query `tenant_members` joined with `tenants` where `tenants.is_active = true`.
 * 4. Apply workspace selection:
 *    - If valid cookie hint matches one of the user's active memberships, select it.
 *    - If cookie is missing or invalid:
 *      - If user has exactly 1 active workspace, resolve it.
 *      - If user has multiple active workspaces, return `status: 'selection_required'`.
 * 5. Query read-only subscription status for the selected workspace.
 */
export async function getTenantContext(
  options: TenantContextOptions = {}
): Promise<TenantResolutionResult> {
  const supabase =
    options.supabaseClient ?? (await getDefaultSupabaseClient());

  // 1. Authenticate user
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return {
      status: "unauthenticated",
      error: "Unauthorized: Please sign in",
    };
  }

  // 2. Verify profile active state
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, is_active, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile || !profile.is_active) {
    return {
      status: "inactive_profile",
      error: "Forbidden: Account is deactivated",
      userId: user.id,
    };
  }

  // 3. Query tenant memberships with joined active tenants
  const { data: memberRows, error: memberErr } = await supabase
    .from("tenant_members")
    .select(`
      id,
      role,
      tenant_id,
      tenants!inner (
        id,
        name,
        slug,
        is_active
      )
    `)
    .eq("user_id", user.id);

  if (memberErr || !memberRows || memberRows.length === 0) {
    return {
      status: "no_workspaces",
      error: "Forbidden: You do not belong to an active workspace",
      userId: user.id,
    };
  }

  // Filter only memberships where the tenant itself is active
  const activeMemberships = memberRows.filter(
    (m) => m.tenants && m.tenants.is_active
  );

  if (activeMemberships.length === 0) {
    return {
      status: "no_workspaces",
      error: "Forbidden: You do not belong to an active workspace",
      userId: user.id,
    };
  }

  // 4. Resolve Workspace Selection via Hint Cookie
  const candidateCookie = await getTenantCookie(options.cookieTenantId);
  let selectedMembership = candidateCookie
    ? activeMemberships.find((m) => m.tenant_id === candidateCookie)
    : undefined;

  if (!selectedMembership) {
    // Cookie was absent, invalid, or belonged to another tenant the user is not a member of
    if (activeMemberships.length === 1) {
      // Exactly one active workspace: safely resolve it
      selectedMembership = activeMemberships[0];
    } else {
      // Multiple active workspaces exist without a valid selection: mandate selection!
      const availableWorkspaces: AvailableWorkspaceSummary[] =
        activeMemberships.map((m) => ({
          tenantId: m.tenant_id,
          tenantName: m.tenants.name,
          tenantSlug: m.tenants.slug,
          role: m.role as TenantRole,
          membershipId: m.id,
        }));

      return {
        status: "selection_required",
        error: "Workspace selection required: Multiple active workspaces available",
        userId: user.id,
        availableWorkspaces,
      };
    }
  }

  // 5. Query read-only subscription status for selected workspace
  const { data: sub } = await supabase
    .from("tenant_subscriptions")
    .select("status, current_period_end, trial_ends_at")
    .eq("tenant_id", selectedMembership.tenant_id)
    .maybeSingle();

  const subStatus = (sub?.status ?? "pending") as
    | "pending"
    | "trialing"
    | "active"
    | "expired"
    | "suspended"
    | "pending_payment";
  const currentPeriodEnd = sub?.current_period_end ?? null;
  const trialEndsAt = (sub as { trial_ends_at?: string | null })?.trial_ends_at ?? null;

  const now = new Date();
  const isTrial =
    subStatus === "trialing" &&
    Boolean(trialEndsAt && new Date(trialEndsAt) > now);
  const isStandardActive =
    subStatus === "active" &&
    Boolean(currentPeriodEnd && new Date(currentPeriodEnd) > now);
  const isSubscriptionActive = isTrial || isStandardActive;
  const trialRemainingSeconds =
    isTrial && trialEndsAt
      ? Math.max(
          0,
          Math.floor((new Date(trialEndsAt).getTime() - now.getTime()) / 1000)
        )
      : 0;

  const context: TenantContext = {
    userId: user.id,
    tenantId: selectedMembership.tenant_id,
    tenantSlug: selectedMembership.tenants.slug,
    tenantName: selectedMembership.tenants.name,
    role: selectedMembership.role as TenantRole,
    membershipId: selectedMembership.id,
    isSubscriptionActive,
    subscriptionStatus: subStatus,
    currentPeriodEnd,
    trialEndsAt,
    isTrial,
    trialRemainingSeconds,
  };

  return {
    status: "resolved",
    context,
  };
}

// ─── High-Level Assertion API ─────────────────────────────────────────────────

/**
 * Requires an active, resolved tenant context for the authenticated caller.
 * Throws a specific `TenantAuthError` if the user is unauthenticated, deactivated,
 * belongs to no active workspace, or has multiple workspaces without a selection.
 */
export async function requireTenantContext(
  options: TenantContextOptions = {}
): Promise<TenantContext> {
  const result = await getTenantContext(options);

  switch (result.status) {
    case "resolved":
      return result.context;

    case "unauthenticated":
      throw new TenantAuthError(result.error, "UNAUTHENTICATED");

    case "inactive_profile":
      throw new TenantAuthError(result.error, "ACCOUNT_DEACTIVATED");

    case "no_workspaces":
      throw new TenantAuthError(result.error, "NO_WORKSPACES");

    case "selection_required":
      throw new WorkspaceSelectionRequiredError(result.availableWorkspaces);
  }
}

/**
 * Requires that the authenticated user possesses an explicit permission within their workspace.
 * Throws `TenantAuthError` with code `INSUFFICIENT_PERMISSIONS` if the caller's role lacks the capability.
 */
export async function requirePermission(
  permission: TenantPermission,
  options: TenantContextOptions = {}
): Promise<TenantContext> {
  const context = await requireTenantContext(options);

  if (!can(context, permission)) {
    throw new TenantAuthError(
      `Forbidden: Role '${context.role}' lacks permission '${permission}'`,
      "INSUFFICIENT_PERMISSIONS"
    );
  }

  return context;
}

/**
 * Requires that the authenticated user is an explicit 'owner' of their workspace.
 * Throws `TenantAuthError` with code `NOT_OWNER` if the caller's role is not 'owner'.
 */
export async function requireWorkspaceOwner(
  options: TenantContextOptions = {}
): Promise<TenantContext> {
  const context = await requireTenantContext(options);

  if (context.role !== "owner") {
    throw new TenantAuthError(
      "Forbidden: Workspace owner privileges required",
      "NOT_OWNER"
    );
  }

  return context;
}

/**
 * Requires that the authenticated user possesses an explicit permission within their workspace
 * AND that the workspace subscription or 72-hour trial is currently active.
 * Throws `TenantAuthError` with code `SUBSCRIPTION_EXPIRED` if the subscription/trial has expired.
 */
export async function requireActiveSubscription(
  permission?: TenantPermission,
  options: TenantContextOptions = {}
): Promise<TenantContext> {
  const context = permission
    ? await requirePermission(permission, options)
    : await requireTenantContext(options);

  if (!context.isSubscriptionActive) {
    throw new TenantAuthError(
      "Workspace subscription or trial is expired. Active subscription required.",
      "SUBSCRIPTION_EXPIRED"
    );
  }

  return context;
}
