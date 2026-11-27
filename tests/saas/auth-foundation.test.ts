// tests/saas/auth-foundation.test.ts
// Test Suite: Phase 3B1 Multi-Tenant Authentication & Authorization Foundation
//
// ⚠️ TEST ENVIRONMENT CLASSIFICATION:
// CLASSIFICATION: MOCKED UNIT / INTEGRATION TESTS
// REASON: Database migrations 00007-00014 remain unapplied per Phase 3B1 restrictions.
// These tests exercise the real application logic in lib/auth/permissions.ts and
// lib/auth/tenant.ts against simulated Supabase responses representing real schema contracts.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import {
  can,
  assertCan,
  isValidRole,
  isValidPermission,
  getPermissionsForRole,
  TenantPermissionError,
} from "../../lib/auth/permissions.ts";
import {
  getTenantContext,
  requireTenantContext,
  requirePermission,
  requireWorkspaceOwner,
  TenantAuthError,
  WorkspaceSelectionRequiredError,
  isValidUuid,
} from "../../lib/auth/tenant.ts";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNRELATED_TENANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const mockUser: User = {
  id: USER_ID,
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

/**
 * Creates a mock Supabase client for testing database query responses.
 */
function createMockSupabase(overrides: {
  user?: User | null;
  authError?: Error | null;
  profile?: { id: string; is_active: boolean; role: "teacher" | "student" } | null;
  profileError?: Error | null;
  memberships?: Array<{
    id: string;
    role: "owner" | "admin" | "instructor" | "assistant";
    tenant_id: string;
    tenants: {
      id: string;
      name: string;
      slug: string;
      is_active: boolean;
    } | null;
  }> | null;
  membershipsError?: Error | null;
  subscription?: {
    status: "pending" | "active" | "expired" | "suspended";
    current_period_end: string;
  } | null;
}): SupabaseClient<Database> {
  const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();

  return {
    auth: {
      getUser: async () => {
        if (overrides.authError) {
          return { data: { user: null }, error: overrides.authError };
        }
        return { data: { user: overrides.user ?? null }, error: null };
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  overrides.profile !== undefined
                    ? overrides.profile
                    : { id: USER_ID, is_active: true, role: "teacher" as const },
                error: overrides.profileError ?? null,
              }),
            }),
          }),
        };
      }

      if (table === "tenant_members") {
        return {
          select: () => ({
            eq: async () => ({
              data: overrides.memberships ?? null,
              error: overrides.membershipsError ?? null,
            }),
          }),
        };
      }

      if (table === "tenant_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  overrides.subscription !== undefined
                    ? overrides.subscription
                    : {
                        status: "active" as const,
                        current_period_end: futureDate,
                      },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected mock table query: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Phase 3B1: Multi-Tenant Authentication & Authorization Foundation", () => {
  // ─── 1. Unauthenticated User Rejection ──────────────────────────────────────
  it("Scenario 1: Rejects unauthenticated user requests", async () => {
    const mockClient = createMockSupabase({
      user: null,
      authError: new Error("Auth session missing"),
    });

    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: null,
    });

    assert.strictEqual(result.status, "unauthenticated");
    assert.match(result.error, /unauthorized/i);

    await assert.rejects(
      async () => {
        await requireTenantContext({
          supabaseClient: mockClient,
          cookieTenantId: null,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.strictEqual(err.code, "UNAUTHENTICATED");
        return true;
      }
    );
  });

  // ─── 2. User with One Workspace ─────────────────────────────────────────────
  it("Scenario 2: Automatically resolves single active workspace without cookie", async () => {
    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics Academy",
            slug: "amila-physics",
            is_active: true,
          },
        },
      ],
    });

    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: null,
    });

    assert.strictEqual(result.status, "resolved");
    assert.strictEqual(result.context.tenantId, TENANT_1_ID);
    assert.strictEqual(result.context.tenantSlug, "amila-physics");
    assert.strictEqual(result.context.role, "owner");
    assert.strictEqual(result.context.membershipId, "mem-1");
    assert.strictEqual(result.context.isSubscriptionActive, true);
  });

  // ─── 3. User with Multiple Workspaces and No Selection ───────────────────────
  it("Scenario 3: Mandates workspace selection when user has multiple workspaces without selection", async () => {
    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
        {
          id: "mem-2",
          role: "instructor",
          tenant_id: TENANT_2_ID,
          tenants: {
            id: TENANT_2_ID,
            name: "Apex Combined Maths",
            slug: "apex-maths",
            is_active: true,
          },
        },
      ],
    });

    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: null,
    });

    assert.strictEqual(result.status, "selection_required");
    assert.strictEqual(result.availableWorkspaces.length, 2);
    assert.strictEqual(result.availableWorkspaces[0].tenantSlug, "amila-physics");
    assert.strictEqual(result.availableWorkspaces[1].tenantSlug, "apex-maths");

    await assert.rejects(
      async () => {
        await requireTenantContext({
          supabaseClient: mockClient,
          cookieTenantId: null,
        });
      },
      (err: unknown) => {
        assert(err instanceof WorkspaceSelectionRequiredError);
        assert.strictEqual(err.code, "SELECTION_REQUIRED");
        assert.strictEqual(err.availableWorkspaces.length, 2);
        return true;
      }
    );
  });

  // ─── 4. Valid Workspace Cookie ──────────────────────────────────────────────
  it("Scenario 4: Resolves requested workspace when matching valid cookie hint is provided", async () => {
    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
        {
          id: "mem-2",
          role: "instructor",
          tenant_id: TENANT_2_ID,
          tenants: {
            id: TENANT_2_ID,
            name: "Apex Combined Maths",
            slug: "apex-maths",
            is_active: true,
          },
        },
      ],
    });

    const context = await requireTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: TENANT_2_ID,
    });

    assert.strictEqual(context.tenantId, TENANT_2_ID);
    assert.strictEqual(context.tenantSlug, "apex-maths");
    assert.strictEqual(context.role, "instructor");
    assert.strictEqual(context.membershipId, "mem-2");
  });

  // ─── 5. Invalid Workspace Cookie ────────────────────────────────────────────
  it("Scenario 5: Safely ignores malformed or non-UUID cookie values", async () => {
    assert.strictEqual(isValidUuid("not-a-uuid"), false);
    assert.strictEqual(isValidUuid(""), false);
    assert.strictEqual(isValidUuid(null), false);
    assert.strictEqual(isValidUuid("12345"), false);
    assert.strictEqual(isValidUuid(TENANT_1_ID), true);

    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
        {
          id: "mem-2",
          role: "instructor",
          tenant_id: TENANT_2_ID,
          tenants: {
            id: TENANT_2_ID,
            name: "Apex Maths",
            slug: "apex-maths",
            is_active: true,
          },
        },
      ],
    });

    // Malformed cookie for multi-workspace user should trigger selection_required
    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: "malicious-injection-attempt' OR '1'='1",
    });

    assert.strictEqual(result.status, "selection_required");
  });

  // ─── 6. Cookie Pointing to Another User's Workspace ─────────────────────────
  it("Scenario 6: Rejects cookie pointing to a tenant the user is NOT a member of", async () => {
    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
        {
          id: "mem-2",
          role: "instructor",
          tenant_id: TENANT_2_ID,
          tenants: {
            id: TENANT_2_ID,
            name: "Apex Maths",
            slug: "apex-maths",
            is_active: true,
          },
        },
      ],
    });

    // Cookie points to UNRELATED_TENANT_ID (which user has no membership in)
    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: UNRELATED_TENANT_ID,
    });

    // Does NOT grant access to UNRELATED_TENANT_ID; mandates safe selection
    assert.strictEqual(result.status, "selection_required");
    if (result.status === "selection_required") {
      const ids = result.availableWorkspaces.map((w) => w.tenantId);
      assert.ok(!ids.includes(UNRELATED_TENANT_ID));
    }
  });

  // ─── 7. Inactive Membership (Profile Deactivated) ───────────────────────────
  it("Scenario 7: Rejects user whose profile is deactivated (is_active = false)", async () => {
    const mockClient = createMockSupabase({
      user: mockUser,
      profile: {
        id: USER_ID,
        is_active: false,
        role: "teacher",
      },
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
      ],
    });

    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: null,
    });

    assert.strictEqual(result.status, "inactive_profile");
    assert.match(result.error, /deactivated/i);

    await assert.rejects(
      async () => {
        await requireTenantContext({
          supabaseClient: mockClient,
          cookieTenantId: null,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.strictEqual(err.code, "ACCOUNT_DEACTIVATED");
        return true;
      }
    );
  });

  // ─── 8. Inactive Tenant ─────────────────────────────────────────────────────
  it("Scenario 8: Rejects access when the tenant is deactivated (tenants.is_active = false)", async () => {
    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Suspended Workspace",
            slug: "suspended-ws",
            is_active: false, // Inactive tenant!
          },
        },
      ],
    });

    const result = await getTenantContext({
      supabaseClient: mockClient,
      cookieTenantId: null,
    });

    assert.strictEqual(result.status, "no_workspaces");

    await assert.rejects(
      async () => {
        await requireTenantContext({
          supabaseClient: mockClient,
          cookieTenantId: null,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.strictEqual(err.code, "NO_WORKSPACES");
        return true;
      }
    );
  });

  // ─── 9. Owner Permissions ───────────────────────────────────────────────────
  it("Scenario 9: Owner role possesses full administrative and governance capabilities", async () => {
    const ownerPerms = getPermissionsForRole("owner");
    assert.strictEqual(ownerPerms.length, 19);

    assert.strictEqual(can("owner", "workspace:manage_settings"), true);
    assert.strictEqual(can("owner", "workspace:delete"), true);
    assert.strictEqual(can("owner", "billing:manage_subscription"), true);
    assert.strictEqual(can("owner", "billing:view_history"), true);
    assert.strictEqual(can("owner", "members:invite_manage"), true);
    assert.strictEqual(can("owner", "batches:delete"), true);
    assert.strictEqual(can("owner", "students:create_enroll"), true);
    assert.strictEqual(can("owner", "lessons:create_edit"), true);
    assert.strictEqual(can("owner", "storage:access_private_pdf"), true);

    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "owner",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
      ],
    });

    const context = await requireWorkspaceOwner({
      supabaseClient: mockClient,
      cookieTenantId: null,
    });
    assert.strictEqual(context.role, "owner");
  });

  // ─── 10. Admin Permissions ──────────────────────────────────────────────────
  it("Scenario 10: Admin role possesses operational rights but lacks workspace deletion and billing mutation", async () => {
    // Admin CAN do operational management:
    assert.strictEqual(can("admin", "billing:view_history"), true);
    assert.strictEqual(can("admin", "members:invite_manage"), true);
    assert.strictEqual(can("admin", "members:remove_staff"), true);
    assert.strictEqual(can("admin", "batches:create_edit"), true);
    assert.strictEqual(can("admin", "batches:delete"), true);
    assert.strictEqual(can("admin", "students:create_enroll"), true);
    assert.strictEqual(can("admin", "students:delete"), true);
    assert.strictEqual(can("admin", "lessons:create_edit"), true);
    assert.strictEqual(can("admin", "notes:upload_manage"), true);

    // Admin CANNOT do owner-exclusive actions:
    assert.strictEqual(can("admin", "workspace:manage_settings"), false);
    assert.strictEqual(can("admin", "workspace:delete"), false);
    assert.strictEqual(can("admin", "billing:manage_subscription"), false);

    const mockClient = createMockSupabase({
      user: mockUser,
      memberships: [
        {
          id: "mem-1",
          role: "admin",
          tenant_id: TENANT_1_ID,
          tenants: {
            id: TENANT_1_ID,
            name: "Amila Physics",
            slug: "amila-physics",
            is_active: true,
          },
        },
      ],
    });

    // Admin passes batch management requirement:
    const ctx = await requirePermission("batches:create_edit", {
      supabaseClient: mockClient,
      cookieTenantId: null,
    });
    assert.strictEqual(ctx.role, "admin");

    // Admin fails owner-only requirement:
    await assert.rejects(
      async () => {
        await requireWorkspaceOwner({
          supabaseClient: mockClient,
          cookieTenantId: null,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.strictEqual(err.code, "NOT_OWNER");
        return true;
      }
    );
  });

  // ─── 11. Instructor Permissions ─────────────────────────────────────────────
  it("Scenario 11: Instructor role manages curriculum but cannot delete batches, enroll students, or manage billing", async () => {
    // Instructor CAN manage teaching content:
    assert.strictEqual(can("instructor", "lessons:create_edit"), true);
    assert.strictEqual(can("instructor", "lessons:delete"), true);
    assert.strictEqual(can("instructor", "notes:upload_manage"), true);
    assert.strictEqual(can("instructor", "notes:delete"), true);
    assert.strictEqual(can("instructor", "announcements:create_edit"), true);
    assert.strictEqual(can("instructor", "batches:create_edit"), true);
    assert.strictEqual(can("instructor", "students:view_list"), true);
    assert.strictEqual(can("instructor", "storage:access_private_pdf"), true);

    // Instructor CANNOT perform administrative or destruction actions:
    assert.strictEqual(can("instructor", "batches:delete"), false);
    assert.strictEqual(can("instructor", "students:create_enroll"), false);
    assert.strictEqual(can("instructor", "students:edit_status"), false);
    assert.strictEqual(can("instructor", "students:delete"), false);
    assert.strictEqual(can("instructor", "members:invite_manage"), false);
    assert.strictEqual(can("instructor", "billing:manage_subscription"), false);
    assert.strictEqual(can("instructor", "billing:view_history"), false);
    assert.strictEqual(can("instructor", "workspace:manage_settings"), false);
    assert.strictEqual(can("instructor", "workspace:delete"), false);
  });

  // ─── 12. Assistant Permissions ──────────────────────────────────────────────
  it("Scenario 12: Assistant role possesses restricted support rights and cannot delete content or manage batches", async () => {
    // Assistant CAN perform support duties:
    assert.strictEqual(can("assistant", "students:view_list"), true);
    assert.strictEqual(can("assistant", "announcements:create_edit"), true);
    assert.strictEqual(can("assistant", "storage:access_private_pdf"), true);

    // Assistant CANNOT create/edit/delete curriculum or manage batches:
    assert.strictEqual(can("assistant", "batches:create_edit"), false);
    assert.strictEqual(can("assistant", "batches:delete"), false);
    assert.strictEqual(can("assistant", "lessons:create_edit"), false);
    assert.strictEqual(can("assistant", "lessons:delete"), false);
    assert.strictEqual(can("assistant", "notes:upload_manage"), false);
    assert.strictEqual(can("assistant", "notes:delete"), false);
    assert.strictEqual(can("assistant", "announcements:delete"), false);
    assert.strictEqual(can("assistant", "students:create_enroll"), false);
    assert.strictEqual(can("assistant", "billing:view_history"), false);
  });

  // ─── 13. Unknown Role Rejection ─────────────────────────────────────────────
  it("Scenario 13: Rejects unknown roles by default", () => {
    assert.strictEqual(isValidRole("superadmin"), false);
    assert.strictEqual(isValidRole("student"), false);
    assert.strictEqual(isValidRole(""), false);
    assert.strictEqual(isValidRole(null), false);
    assert.strictEqual(isValidRole(undefined), false);

    assert.strictEqual(can("superadmin", "batches:create_edit"), false);
    assert.strictEqual(can("student", "lessons:create_edit"), false);
    assert.strictEqual(can(null, "batches:create_edit"), false);
    assert.strictEqual(can(undefined, "batches:create_edit"), false);
    assert.strictEqual(can({ role: "hacker" }, "workspace:delete"), false);

    assert.deepStrictEqual(getPermissionsForRole("invalid-role"), []);
  });

  // ─── 14. Unknown Permission Rejection ───────────────────────────────────────
  it("Scenario 14: Rejects unknown permissions by default", () => {
    assert.strictEqual(isValidPermission("system:root_access"), false);
    assert.strictEqual(isValidPermission("batches:purge"), false);
    assert.strictEqual(isValidPermission(""), false);
    assert.strictEqual(isValidPermission(null), false);

    assert.strictEqual(can("owner", "system:root_access"), false);
    assert.strictEqual(can("admin", "invalid:perm"), false);
    assert.strictEqual(can("owner", ""), false);

    assert.throws(
      () => {
        assertCan("owner", "system:root_access");
      },
      (err: unknown) => {
        assert(err instanceof TenantPermissionError);
        assert.strictEqual(err.permission, "system:root_access");
        return true;
      }
    );
  });
});
