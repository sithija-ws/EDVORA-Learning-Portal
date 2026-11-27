// lib/auth/assert.ts
// Shared teacher assertion helper for Server Actions.

import { requireTenantContext } from "@/lib/auth/tenant";

/**
 * Asserts the current user has authenticated access within an active tenant context.
 *
 * @deprecated Legacy assertion helper. Use `requireTenantContext()` or `requirePermission()`
 * from `@/lib/auth/tenant` or `@/lib/auth/permissions` instead.
 *
 * Migrated to eliminate unverified cookies (`edvora-role`) and replace `getSession()`
 * with verified server-side authentication (`auth.getUser()`) and database-backed
 * tenant membership resolution.
 */
export async function assertTeacher(): Promise<string> {
  const context = await requireTenantContext();
  return context.userId;
}
