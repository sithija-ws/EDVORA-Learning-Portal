# Edvora Multi-Tenant SaaS — Phase 3B1 Implementation Report

> [!IMPORTANT]
> **PHASE STATUS**: **PHASE 3B1 IMPLEMENTATION COMPLETE**  
> **Scope**: Multi-Tenant Authentication & Authorization Foundation (`lib/auth/tenant.ts`, `lib/auth/permissions.ts`, `types/index.ts`, `types/database.ts`).  
> **Execution Gate**: Implementation is paused at the Phase 3B1 boundary. No Phase 3B2 work (Server Action refactoring, registration, billing UI, or storage migration) has been initiated.

---

## 1. Executive Summary

Phase 3B1 delivers the authoritative, server-side authentication and authorization foundation for Edvora's multi-tenant conversion (**Model A: Shared Application + Shared Database + Strict Tenant Isolation**).

This phase establishes:
1. **Cryptographic Identity Verification**: All server-side tenant operations mandate `supabase.auth.getUser()`, entirely replacing unverified session cookie trust.
2. **Database-Driven Membership Scoping**: Workspace access is derived strictly from trusted PostgreSQL records (`public.tenant_members`, `public.tenants`, `public.profiles`), verifying active user and active tenant status. Client-supplied tenant IDs are never trusted as authorization.
3. **Safe Workspace Hinting & Cookie Protocol**: The `edvora-tenant` cookie is treated strictly as an untrusted UI selection hint. For users with multiple workspaces, an explicit selection is mandated if the hint is missing or unauthorized.
4. **Non-Linear Explicit Permission System**: Numeric role weights have been replaced by an explicit, 19-capability permission matrix in `lib/auth/permissions.ts`. Unrecognized roles and permissions are rejected by default.
5. **Comprehensive Automated Verification**: 14 distinct test scenarios were implemented and executed using Node.js's native test runner (`npm run test:saas`), achieving a **100% pass rate** alongside clean static typing (`npx tsc --noEmit`) and linting (`npm run lint`).

---

## 2. Files Created and Modified

| Action | File Path | Description |
| :--- | :--- | :--- |
| **CREATE** | `lib/auth/permissions.ts` | Explicit role-based permission system, capability matrix, and type guards (`can`, `assertCan`, `isValidRole`, `isValidPermission`). |
| **CREATE** | `lib/auth/tenant.ts` | Centralized tenant authorization engine, cryptographic user verification (`auth.getUser()`), membership resolution, and cookie utilities. |
| **CREATE** | `tests/saas/auth-foundation.test.ts` | Automated test suite validating all 14 mandatory authentication and authorization scenarios. |
| **CREATE** | `docs/saas/PHASE_3B1_IMPLEMENTATION_REPORT.md` | Formal engineering documentation of Phase 3B1 implementation. |
| **MODIFY** | `types/index.ts` | Exported application-level SaaS types (`TenantRole`, `TenantPermission`, `TenantContext`, `AvailableWorkspaceSummary`, `Tenant`, `TenantMember`). |
| **MODIFY** | `types/database.ts` | Extended Supabase PostgREST database types with table schemas and foreign-key relationships for `tenants`, `tenant_members`, `student_identities`, `subscription_plans`, and `tenant_subscriptions`. |
| **MODIFY** | `tsconfig.json` | Enabled `"allowImportingTsExtensions": true` for native TypeScript file execution under Node 24. |
| **MODIFY** | `package.json` | Added `"test:saas"` convenience script pointing to the automated test suite. |

---

## 3. Authentication Architecture & Verification

### A. Vulnerability of Session-Only Authorization
In Supabase Next.js implementations, `supabase.auth.getSession()` merely reads and parses the unverified local JWT from browser cookies. It does not contact the Supabase Auth server, meaning revoked tokens, deleted users, or changed passwords can bypass local checks.

### B. The `auth.getUser()` Invariant
In `lib/auth/tenant.ts`, `getAuthenticatedUser()` enforces:
```typescript
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
```
- Every sensitive operation validates the cryptographic token directly against the Supabase Auth backend.
- If unauthenticated, `requireTenantContext()` throws `TenantAuthError` with code `UNAUTHENTICATED`.

---

## 4. Tenant Membership & Context Resolution

### A. Schema-Aligned Membership Query
Per database migrations `00007_create_tenant_infrastructure.sql` and `00010_tenant_auth_functions.sql`, a workspace membership is active only when:
1. A row exists in `public.tenant_members` matching `user_id = user.id`.
2. The user's account in `public.profiles` has `is_active = true`.
3. The associated workspace in `public.tenants` has `is_active = true`.

`lib/auth/tenant.ts` queries:
```typescript
// 1. Verify profile active state
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

// 2. Query tenant memberships with joined active tenants
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
```

### B. Minimal `TenantContext` Interface
The resolved context exposes only the verified parameters necessary for tenant-scoped operations:
```typescript
export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: TenantRole;
  membershipId: string;
  isSubscriptionActive: boolean;
  subscriptionStatus: "pending" | "active" | "expired" | "suspended";
  currentPeriodEnd: string | null;
}
```
No sensitive fields (such as owner profile hashes, internal platform admin flags, or private billing keys) are exposed in `TenantContext`.

---

## 5. Workspace Selection & Cookie Security

### A. The `edvora-tenant` Cookie Contract
- **Client Selection Hint Only**: The `edvora-tenant` cookie is strictly an untrusted client UI hint.
- **Validation Against Database**: The cookie value is matched against the caller's verified active memberships:
  ```typescript
  const candidateCookie = await getTenantCookie(options.cookieTenantId);
  let selectedMembership = candidateCookie
    ? activeMemberships.find((m) => m.tenant_id === candidateCookie)
    : undefined;
  ```
- **Malformed / Unauthorized Protection**: If the cookie is not a valid UUID, or if it points to a tenant where the caller has no active membership, it is discarded.

### B. Safe Multi-Workspace Handling (No Arbitrary Defaults)
- **Single Workspace**: If the user has exactly 1 active workspace, it is safely resolved automatically, even if the cookie is absent or invalid.
- **Multiple Workspaces**: If a user belongs to more than 1 active workspace and has not supplied a valid matching cookie hint:
  - The system **does NOT** arbitrarily pick the first workspace.
  - `getTenantContext()` returns `status: 'selection_required'` alongside a list of `availableWorkspaces`.
  - `requireTenantContext()` throws a structured `WorkspaceSelectionRequiredError`.

### C. Student Route Isolation
- Student routes (`/home/*`) and student authentication do not use or read `edvora-tenant`.
- Even if a student injects an `edvora-tenant` cookie, `requireTenantContext()` rejects them because they possess no active record in `public.tenant_members`.

### D. Production Cookie Attributes
When set via `setTenantCookie(tenantId)`, the cookie is configured with:
- `httpOnly: true` (inaccessible to browser JavaScript)
- `secure: process.env.NODE_ENV === "production"`
- `sameSite: "lax"` (CSRF protection)
- `path: "/"`
- `maxAge: 30 * 24 * 60 * 60` (30 days)

---

## 6. Explicit Permission Matrix Implementation

### A. Capability Matrix vs. Numeric Hierarchy
Linear numeric inheritance (`owner: 40 > admin: 30 > instructor: 20 > assistant: 10`) was eliminated. Instead, `lib/auth/permissions.ts` implements discrete, decoupled capability sets:

```typescript
const ROLE_PERMISSIONS: Readonly<Record<TenantRole, ReadonlySet<TenantPermission>>> = {
  owner: new Set([/* All 19 permissions */]),
  admin: new Set([
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
  instructor: new Set([
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
  assistant: new Set([
    "students:view_list",
    "announcements:create_edit",
    "storage:access_private_pdf",
  ]),
};
```

### B. Core Operational Distinctions:
1. **Instructors cannot**:
   - Delete batches (`batches:delete` is restricted to owner and admin).
   - Create, enroll, or delete students (`students:create_enroll`, `students:delete`).
   - Invite or remove team members (`members:invite_manage`, `members:remove_staff`).
   - Access billing history or modify workspace settings.
2. **Admins cannot**:
   - Manage workspace settings or delete the workspace (`workspace:manage_settings`, `workspace:delete`).
   - Mutate billing plans or upload payment slips (`billing:manage_subscription`).
3. **Assistants cannot**:
   - Create or edit curriculum (batches, lessons, notes).
   - Delete announcements (they can only create notices).
   - Enroll or manage students (view-only roster permission).

### C. Application Checks vs. Database RLS
Application checks via `can(context, permission)` and `requirePermission(permission)` enforce business rules before initiating database operations. They are explicitly documented as **defense-in-depth** and **never** a substitute for PostgreSQL RLS policies in migrations `00011` and `00012`.

---

## 7. Security Decisions & Guardrails

1. **Deny by Default**: Any unrecognized role string, null context, or undefined permission returns `false` in `can()`.
2. **Zero Information Leakage**: If an invalid tenant ID is passed in a cookie, the error returned does not reveal whether the tenant exists. It simply indicates that workspace selection is required or that the user has no access.
3. **Decoupled Server Imports**: In `lib/auth/tenant.ts`, Next.js runtime modules (`next/headers` and `lib/supabase/server`) are dynamically loaded inside runtime functions, allowing unit testing and external invocation without mocking framework internals.
4. **Read-Only Subscription Context**: `TenantContext` surfaces `isSubscriptionActive` derived from `tenant_subscriptions.status` and `current_period_end`. No billing mutation or subscription activation logic is implemented in this phase.

---

## 8. Automated Testing & Verification Results

### Test Environment Classification
- **Classification**: **Mocked Unit / Integration Tests**.
- **Reason**: Migrations `00007`–`00014` are unapplied per the strict read-only / preparation rules of prior phases. Tests simulate Supabase PostgREST and Auth responses matching real migration contracts.

### Test Execution Results (`npm run test:saas`)
Command: `node --experimental-strip-types --test tests/saas/auth-foundation.test.ts`

```
▶ Phase 3B1: Multi-Tenant Authentication & Authorization Foundation
  ✔ Scenario 1: Rejects unauthenticated user requests (1.8319ms)
  ✔ Scenario 2: Automatically resolves single active workspace without cookie (0.5398ms)
  ✔ Scenario 3: Mandates workspace selection when user has multiple workspaces without selection (0.3603ms)
  ✔ Scenario 4: Resolves requested workspace when matching valid cookie hint is provided (0.4508ms)
  ✔ Scenario 5: Safely ignores malformed or non-UUID cookie values (0.2657ms)
  ✔ Scenario 6: Rejects cookie pointing to a tenant the user is NOT a member of (0.3116ms)
  ✔ Scenario 7: Rejects user whose profile is deactivated (is_active = false) (0.3323ms)
  ✔ Scenario 8: Rejects access when the tenant is deactivated (tenants.is_active = false) (0.4211ms)
  ✔ Scenario 9: Owner role possesses full administrative and governance capabilities (0.4457ms)
  ✔ Scenario 10: Admin role possesses operational rights but lacks workspace deletion and billing mutation (0.6669ms)
  ✔ Scenario 11: Instructor role manages curriculum but cannot delete batches, enroll students, or manage billing (0.133ms)
  ✔ Scenario 12: Assistant role possesses restricted support rights and cannot delete content or manage batches (0.0963ms)
  ✔ Scenario 13: Rejects unknown roles by default (0.7565ms)
  ✔ Scenario 14: Rejects unknown permissions by default (0.2303ms)
✔ Phase 3B1: Multi-Tenant Authentication & Authorization Foundation (8.7896ms)

ℹ tests 14
ℹ suites 1
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 182.8427
```

### Static Typecheck & Linting
- **TypeScript**: `npx tsc --noEmit` exited with **0 errors**.
- **ESLint**: `npm run lint` exited with **0 errors and 0 warnings**.

---

## 9. Compatibility & Non-Breaking Invariants

1. **Existing Server Actions**: `lib/auth/assert.ts` remains intact, preserving existing single-teacher Server Actions (`actions/batches.ts`, `actions/lessons.ts`, etc.) without breaking current application behavior.
2. **Student Flow Preserved**: No student authentication changes or route modifications were introduced in Phase 3B1.
3. **Edge Middleware Performance**: Edge middleware was not burdened with database queries; cookie validation remains strictly at the server boundary where authorization decisions take place.

---

## 10. Remaining Risks & Phase 3B2 Boundaries

1. **Unapplied Database Migrations**: Migrations `00007`–`00014` remain unapplied on disk. Live database integration testing can only take place once migrations are applied in an authorized environment.
2. **Phase 3B2 Scope Boundary**:
   - `actions/auth.ts`: Student workspace-scoped identity resolution and teacher workspace registration have **not** been modified in this phase.
   - `actions/*.ts`: Existing Server Actions have **not** yet been refactored to consume `requirePermission()`. That will occur systematically in Phase 3B2/3B3.
   - Storage pre-signing and billing UI remain intentionally untouched.

---

## 11. Conclusion & Stop Point

Phase 3B1 has completed all foundational requirements successfully with verified test results and zero TypeScript or linting errors.

In accordance with execution instructions, work is **STOPPED** at the Phase 3B1 boundary. We await your independent review before proceeding to Phase 3B2.
