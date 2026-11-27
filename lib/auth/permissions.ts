// lib/auth/permissions.ts
// Explicit Role-Based Permission System for Edvora Multi-Tenant SaaS.
//
// ⚠️ SECURITY MANDATE:
// Application-tier permission checks are an architectural defense-in-depth layer.
// They must NEVER be treated or presented as a replacement for PostgreSQL Row-Level Security (RLS).
// All database queries must remain subject to database RLS policies.

/**
 * Valid workspace staff roles matching public.tenant_members check constraint.
 */
export const TENANT_ROLES = [
  "owner",
  "admin",
  "instructor",
  "assistant",
] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

/**
 * Explicit operational permissions mapping directly to the Phase 3A.1 capability matrix.
 * Numeric weights have been eliminated to prevent unintended privilege escalation.
 */
export const TENANT_PERMISSIONS = [
  // Workspace Governance
  "workspace:manage_settings",
  "workspace:delete",

  // Subscription & Billing
  "billing:manage_subscription",
  "billing:view_history",

  // Team Management
  "members:invite_manage",
  "members:remove_staff",

  // Batch Management
  "batches:create_edit",
  "batches:delete",

  // Student Management
  "students:create_enroll",
  "students:view_list",
  "students:edit_status",
  "students:delete",

  // Lesson Management
  "lessons:create_edit",
  "lessons:delete",

  // Notes & Material
  "notes:upload_manage",
  "notes:delete",

  // Announcements
  "announcements:create_edit",
  "announcements:delete",

  // Storage Security
  "storage:access_private_pdf",
] as const;

export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];

/**
 * Centralized, immutable permission capability matrix.
 * Non-linear mapping: higher roles do NOT automatically inherit unassigned capabilities.
 */
const ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<TenantPermission>>
> = {
  owner: new Set<TenantPermission>([
    "workspace:manage_settings",
    "workspace:delete",
    "billing:manage_subscription",
    "billing:view_history",
    "members:invite_manage",
    "members:remove_staff",
    "batches:create_edit",
    "batches:delete",
    "students:create_enroll",
    "students:view_list",
    "students:edit_status",
    "students:delete",
    "lessons:create_edit",
    "lessons:delete",
    "notes:upload_manage",
    "notes:delete",
    "announcements:create_edit",
    "announcements:delete",
    "storage:access_private_pdf",
  ]),
  admin: new Set<TenantPermission>([
    "billing:view_history",
    "members:invite_manage",
    "members:remove_staff",
    "batches:create_edit",
    "batches:delete",
    "students:create_enroll",
    "students:view_list",
    "students:edit_status",
    "students:delete",
    "lessons:create_edit",
    "lessons:delete",
    "notes:upload_manage",
    "notes:delete",
    "announcements:create_edit",
    "announcements:delete",
    "storage:access_private_pdf",
  ]),
  instructor: new Set<TenantPermission>([
    "batches:create_edit",
    "students:view_list",
    "lessons:create_edit",
    "lessons:delete",
    "notes:upload_manage",
    "notes:delete",
    "announcements:create_edit",
    "announcements:delete",
    "storage:access_private_pdf",
  ]),
  assistant: new Set<TenantPermission>([
    "students:view_list",
    "announcements:create_edit",
    "storage:access_private_pdf",
  ]),
};

/**
 * Type guard to validate whether an unknown value is a supported TenantRole.
 */
export function isValidRole(role: unknown): role is TenantRole {
  return (
    typeof role === "string" &&
    (TENANT_ROLES as readonly string[]).includes(role)
  );
}

/**
 * Type guard to validate whether an unknown value is a supported TenantPermission.
 */
export function isValidPermission(perm: unknown): perm is TenantPermission {
  return (
    typeof perm === "string" &&
    (TENANT_PERMISSIONS as readonly string[]).includes(perm)
  );
}

/**
 * Returns all assigned permissions for a given role.
 * Returns an empty array if the role is unrecognized.
 */
export function getPermissionsForRole(role: unknown): readonly TenantPermission[] {
  if (!isValidRole(role)) {
    return [];
  }
  return Array.from(ROLE_PERMISSIONS[role]);
}

/**
 * Evaluates whether a role or tenant context possesses a specific permission.
 *
 * Rules:
 * - Reject unknown roles by default (returns false).
 * - Reject unknown permissions by default (returns false).
 * - Accepts either a role string or an object with a `role` property (e.g. TenantContext).
 */
export function can(
  subject: { role: string } | string | null | undefined,
  permission: unknown
): boolean {
  if (!subject || !isValidPermission(permission)) {
    return false;
  }

  const role = typeof subject === "string" ? subject : subject.role;
  if (!isValidRole(role)) {
    return false;
  }

  const allowedPermissions = ROLE_PERMISSIONS[role];
  return allowedPermissions.has(permission);
}

/**
 * Custom error thrown when a user or role lacks the required tenant permission.
 */
export class TenantPermissionError extends Error {
  readonly permission: string;
  readonly role?: string;

  constructor(permission: string, role?: string) {
    const roleMsg = role ? `Role '${role}'` : "User";
    super(`Forbidden: ${roleMsg} lacks required permission '${permission}'`);
    this.name = "TenantPermissionError";
    this.permission = permission;
    this.role = role;
  }
}

/**
 * Asserts that a role or tenant context possesses a specific permission.
 * Throws a descriptive TenantPermissionError if authorization fails.
 */
export function assertCan(
  subject: { role: string } | string | null | undefined,
  permission: unknown
): asserts subject is { role: TenantRole } {
  const role =
    typeof subject === "string" ? subject : subject?.role;

  if (!isValidPermission(permission)) {
    throw new TenantPermissionError(
      String(permission),
      typeof role === "string" ? role : undefined
    );
  }

  if (!can(subject, permission)) {
    throw new TenantPermissionError(
      permission,
      typeof role === "string" ? role : undefined
    );
  }
}
