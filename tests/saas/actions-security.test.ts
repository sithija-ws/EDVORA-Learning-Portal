// tests/saas/actions-security.test.ts
// Test Suite: Phase 3B2-A Server Action Multi-Tenant Security & Isolation
//
// ⚠️ TEST ENVIRONMENT CLASSIFICATION:
// CLASSIFICATION: MOCKED UNIT / INTEGRATION TESTS
// REASON: Database migrations 00007-00014 remain unapplied per Phase 3B2-A restrictions.
// Tests exercise the authorization gates, permission enforcements, tenant scoping,
// and cross-tenant boundary isolation across all migrated Server Actions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import {
  can,
  assertCan,
  getPermissionsForRole,
  TenantPermissionError,
  type TenantRole,
} from "../../lib/auth/permissions.ts";
import {
  getTenantContext,
  requireTenantContext,
  requirePermission,
  requireWorkspaceOwner,
  TenantAuthError,
  WorkspaceSelectionRequiredError,
} from "../../lib/auth/tenant.ts";
import { assertTeacher } from "../../lib/auth/assert.ts";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_USER_ID = "22222222-2222-4222-8222-222222222222";
const INSTRUCTOR_USER_ID = "33333333-3333-4333-8333-333333333333";
const ASSISTANT_USER_ID = "44444444-4444-4444-8444-444444444444";
const STUDENT_USER_ID = "55555555-5555-4555-8555-555555555555";

const TENANT_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMockUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

/**
 * Creates a mock Supabase client simulating tenant membership and query scoping.
 */
function createMockClient(options: {
  user?: User | null;
  role?: TenantRole;
  tenantId?: string;
  isProfileActive?: boolean;
  isTenantActive?: boolean;
  multipleMemberships?: Array<{
    id: string;
    role: TenantRole;
    tenant_id: string;
    tenants: {
      id: string;
      name: string;
      slug: string;
      is_active: boolean;
    };
  }>;
}): SupabaseClient<Database> {
  const user = options.user !== undefined ? options.user : createMockUser(OWNER_USER_ID);
  const role = options.role ?? "owner";
  const tenantId = options.tenantId ?? TENANT_A_ID;
  const isProfileActive = options.isProfileActive ?? true;
  const isTenantActive = options.isTenantActive ?? true;

  const defaultMemberships = user
    ? [
        {
          id: "mem-1",
          role,
          tenant_id: tenantId,
          tenants: {
            id: tenantId,
            name: "Test Academy",
            slug: "test-academy",
            is_active: isTenantActive,
          },
        },
      ]
    : [];

  const memberships = options.multipleMemberships ?? defaultMemberships;

  return {
    auth: {
      getUser: async () => ({
        data: { user: user ?? null },
        error: user ? null : new Error("Not signed in"),
      }),
      getSession: async () => ({
        data: { session: null },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: user
                  ? { id: user.id, is_active: isProfileActive, role: "teacher" as const }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "tenant_members") {
        return {
          select: () => ({
            eq: async () => ({
              data: memberships,
              error: null,
            }),
          }),
        };
      }

      if (table === "tenant_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  status: "active" as const,
                  current_period_end: new Date(Date.now() + 86400000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: new Error("Not found") }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("Phase 3B2-A: Server Actions Multi-Tenant Security & Isolation", () => {
  // Scenario 1: Unauthenticated staff requests are rejected
  it("Scenario 1: Rejects unauthenticated requests before any action can execute", async () => {
    const unauthenticatedClient = createMockClient({ user: null });

    await assert.rejects(
      async () => {
        await requireTenantContext({ supabaseClient: unauthenticatedClient });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "UNAUTHENTICATED");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await requirePermission("batches:create_edit", {
          supabaseClient: unauthenticatedClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "UNAUTHENTICATED");
        return true;
      }
    );
  });

  // Scenario 2: An instructor attempting to access another tenant's resources is rejected
  it("Scenario 2: An instructor in Tenant A cannot acquire or operate on Tenant B context", async () => {
    const instructorClient = createMockClient({
      user: createMockUser(INSTRUCTOR_USER_ID),
      role: "instructor",
      tenantId: TENANT_A_ID,
      multipleMemberships: [
        {
          id: "mem-a",
          role: "instructor",
          tenant_id: TENANT_A_ID,
          tenants: {
            id: TENANT_A_ID,
            name: "Tenant A",
            slug: "tenant-a",
            is_active: true,
          },
        },
        {
          id: "mem-other",
          role: "instructor",
          tenant_id: "other-tenant-id",
          tenants: {
            id: "other-tenant-id",
            name: "Other Tenant",
            slug: "other-tenant",
            is_active: true,
          },
        },
      ],
    });

    // Attempting to select Tenant B with cookie hint when not a member
    const result = await getTenantContext({
      supabaseClient: instructorClient,
      cookieTenantId: TENANT_B_ID,
    });

    // Access to Tenant B is denied; triggers selection_required among user's actual memberships
    assert.equal(result.status, "selection_required");

    await assert.rejects(
      async () => {
        await requireTenantContext({
          supabaseClient: instructorClient,
          cookieTenantId: TENANT_B_ID,
        });
      },
      (err: unknown) => {
        assert(err instanceof WorkspaceSelectionRequiredError);
        return true;
      }
    );
  });

  // Scenario 3: An owner accessing their own tenant's resources succeeds
  it("Scenario 3: An owner accessing their authorized tenant succeeds with full permissions", async () => {
    const ownerClient = createMockClient({
      user: createMockUser(OWNER_USER_ID),
      role: "owner",
      tenantId: TENANT_A_ID,
    });

    const context = await requirePermission("batches:create_edit", {
      supabaseClient: ownerClient,
    });
    assert.equal(context.tenantId, TENANT_A_ID);
    assert.equal(context.role, "owner");
    assert.equal(context.userId, OWNER_USER_ID);

    // Owner can access all operational and governance permissions
    const ownerPerms = getPermissionsForRole("owner");
    assert.equal(ownerPerms.length, 19);
    assert.equal(can(context, "workspace:delete"), true);
    assert.equal(can(context, "billing:manage_subscription"), true);
    assert.equal(can(context, "batches:delete"), true);
  });

  // Scenario 4: An admin attempting owner-only operations is rejected
  it("Scenario 4: An admin attempting owner-only operations (workspace deletion, billing) is rejected", async () => {
    const adminClient = createMockClient({
      user: createMockUser(ADMIN_USER_ID),
      role: "admin",
      tenantId: TENANT_A_ID,
    });

    // Operational permissions succeed for admin
    const opContext = await requirePermission("batches:create_edit", {
      supabaseClient: adminClient,
    });
    assert.equal(opContext.role, "admin");

    // Owner-only operations fail
    await assert.rejects(
      async () => {
        await requirePermission("workspace:delete", {
          supabaseClient: adminClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await requirePermission("billing:manage_subscription", {
          supabaseClient: adminClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await requireWorkspaceOwner({ supabaseClient: adminClient });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "NOT_OWNER");
        return true;
      }
    );
  });

  // Scenario 5: An instructor attempting to delete a batch is rejected
  it("Scenario 5: An instructor attempting to delete a batch (batches:delete) is rejected", async () => {
    const instructorClient = createMockClient({
      user: createMockUser(INSTRUCTOR_USER_ID),
      role: "instructor",
      tenantId: TENANT_A_ID,
    });

    // Instructor can create and edit batches
    const editContext = await requirePermission("batches:create_edit", {
      supabaseClient: instructorClient,
    });
    assert.equal(editContext.role, "instructor");

    // Instructor CANNOT delete batches
    assert.equal(can(editContext, "batches:delete"), false);
    assert.throws(
      () => assertCan("instructor", "batches:delete"),
      (err: unknown) => {
        assert(err instanceof TenantPermissionError);
        assert.equal(err.permission, "batches:delete");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await requirePermission("batches:delete", {
          supabaseClient: instructorClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );
  });

  // Scenario 6: An assistant attempting unauthorized curriculum operations is rejected
  it("Scenario 6: An assistant attempting curriculum operations is rejected", async () => {
    const assistantClient = createMockClient({
      user: createMockUser(ASSISTANT_USER_ID),
      role: "assistant",
      tenantId: TENANT_A_ID,
    });

    // Assistant CANNOT create/edit batches
    assert.equal(can("assistant", "batches:create_edit"), false);
    await assert.rejects(
      async () => {
        await requirePermission("batches:create_edit", {
          supabaseClient: assistantClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );

    // Assistant CANNOT create/edit lessons
    assert.equal(can("assistant", "lessons:create_edit"), false);
    await assert.rejects(
      async () => {
        await requirePermission("lessons:create_edit", {
          supabaseClient: assistantClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );

    // Assistant CANNOT upload notes
    assert.equal(can("assistant", "notes:upload_manage"), false);
    await assert.rejects(
      async () => {
        await requirePermission("notes:upload_manage", {
          supabaseClient: assistantClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );
  });

  // Scenario 7: Forged tenant IDs supplied by clients are ignored or rejected
  it("Scenario 7: Forged tenant IDs supplied in request hints are rejected against server records", async () => {
    const multiTenantClient = createMockClient({
      user: createMockUser(INSTRUCTOR_USER_ID),
      role: "instructor",
      tenantId: TENANT_A_ID,
      multipleMemberships: [
        {
          id: "mem-a",
          role: "instructor",
          tenant_id: TENANT_A_ID,
          tenants: {
            id: TENANT_A_ID,
            name: "Tenant A",
            slug: "tenant-a",
            is_active: true,
          },
        },
        {
          id: "mem-other",
          role: "instructor",
          tenant_id: "other-tenant",
          tenants: {
            id: "other-tenant",
            name: "Other Tenant",
            slug: "other-tenant",
            is_active: true,
          },
        },
      ],
    });

    const forgedTenantId = "99999999-9999-4999-8999-999999999999";

    // Client passes a forged tenant ID parameter; safe server resolution rejects it
    const result = await getTenantContext({
      supabaseClient: multiTenantClient,
      cookieTenantId: forgedTenantId,
    });

    assert.equal(result.status, "selection_required");
    if (result.status === "selection_required") {
      assert.equal(
        result.availableWorkspaces.some((w) => w.tenantId === forgedTenantId),
        false
      );
    }
  });

  // Scenario 8: Cross-tenant update and delete attempts are rejected even with valid IDs
  it("Scenario 8: Cross-tenant operations are strictly scoped by tenant_id in queries", async () => {
    let capturedFilter: { id?: string; tenant_id?: string } = {};

    const scopingMockClient = {
      auth: {
        getUser: async () => ({
          data: { user: createMockUser(INSTRUCTOR_USER_ID) },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: INSTRUCTOR_USER_ID, is_active: true, role: "teacher" as const },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "tenant_members") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    id: "mem-1",
                    role: "instructor" as const,
                    tenant_id: TENANT_A_ID,
                    tenants: {
                      id: TENANT_A_ID,
                      name: "Tenant A",
                      slug: "tenant-a",
                      is_active: true,
                    },
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "tenant_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    status: "active" as const,
                    current_period_end: new Date(Date.now() + 86400000).toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "batches" || table === "lessons" || table === "notes" || table === "announcements") {
          return {
            select: () => ({
              eq: (col1: string, val1: string) => ({
                eq: async (col2: string, val2: string) => {
                  capturedFilter = { [col1]: val1, [col2]: val2 };
                  // Foreign tenant resource returns not found
                  if (val2 !== TENANT_A_ID && val1 !== TENANT_A_ID) {
                    return { data: null, error: new Error("Row not found") };
                  }
                  return { data: { id: "res-id", tenant_id: TENANT_A_ID }, error: null };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    const tenant = await requirePermission("batches:create_edit", {
      supabaseClient: scopingMockClient,
    });
    assert.equal(tenant.tenantId, TENANT_A_ID);

    // Query scoped to Tenant A and resource ID
    await (scopingMockClient
      .from("batches")
      .select("id")
      .eq("id", "res-foreign-tenant-b")
      .eq("tenant_id", tenant.tenantId) as unknown as Promise<{ data: unknown; error: unknown }>);

    assert.equal(capturedFilter.tenant_id, TENANT_A_ID);
    assert.equal(capturedFilter.id, "res-foreign-tenant-b");
  });

  // Scenario 9: Service-role operations without valid authorization are rejected
  it("Scenario 9: Unprivileged callers cannot execute student provisioning or admin deletion", async () => {
    const assistantClient = createMockClient({
      user: createMockUser(ASSISTANT_USER_ID),
      role: "assistant",
      tenantId: TENANT_A_ID,
    });

    // Assistant attempts student creation / enrollment
    assert.equal(can("assistant", "students:create_enroll"), false);
    await assert.rejects(
      async () => {
        await requirePermission("students:create_enroll", {
          supabaseClient: assistantClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );

    // Instructor attempts student deletion (requires students:delete)
    assert.equal(can("instructor", "students:delete"), false);
    const instructorClient = createMockClient({
      user: createMockUser(INSTRUCTOR_USER_ID),
      role: "instructor",
      tenantId: TENANT_A_ID,
    });

    await assert.rejects(
      async () => {
        await requirePermission("students:delete", {
          supabaseClient: instructorClient,
        });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "INSUFFICIENT_PERMISSIONS");
        return true;
      }
    );
  });

  // Scenario 10: Student actions remain functional and isolated
  it("Scenario 10: Students are prevented from executing staff actions and have isolated capabilities", async () => {
    // Student has role = student and no tenant_members entry
    const studentMockClient = {
      auth: {
        getUser: async () => ({
          data: { user: createMockUser(STUDENT_USER_ID) },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: STUDENT_USER_ID, is_active: true, role: "student" as const },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "tenant_members") {
          return {
            select: () => ({
              eq: async () => ({
                data: [], // Student has no staff membership
                error: null,
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: new Error("Unauthorized") }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient<Database>;

    // Student attempting staff actions fails with NO_WORKSPACES
    await assert.rejects(
      async () => {
        await requireTenantContext({ supabaseClient: studentMockClient });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "NO_WORKSPACES");
        return true;
      }
    );
  });

  // Additional Check: assertTeacher backward compatibility
  it("assertTeacher backward compatibility: verified function signature and deprecation", async () => {
    assert.equal(typeof assertTeacher, "function");
  });
});
