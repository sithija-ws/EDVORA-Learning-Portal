# Edvora Multi-Tenant SaaS — Phase 3B1 Independent Security Review

> [!IMPORTANT]
> **AUDIT CLASSIFICATION**: INDEPENDENT APPLICATION SECURITY AUDIT & THREAT MODEL  
> **Target Scope**: Multi-Tenant Authentication & Authorization Foundation (`lib/auth/tenant.ts`, `lib/auth/permissions.ts`, `lib/auth/assert.ts`, `lib/supabase/server.ts`, `middleware.ts`, `types/database.ts`, `tests/saas/auth-foundation.test.ts`).  
> **Reviewer**: Independent Senior Application Security Engineer & PostgreSQL Security Specialist.  
> **Status**: **READ-ONLY AUDIT COMPLETE (Zero code or database modifications executed in this review)**.  
> **Final Verdict**: **`APPROVED FOR PHASE 3B2`** (Subject to mandatory Phase 3B2 refactoring directives detailed below).

---

## 1. Executive Summary

This independent security review evaluated the Phase 3B1 authentication and authorization foundation for Edvora's multi-tenant conversion (**Model A: Shared Application + Shared Database + Strict Tenant Isolation**).

### Primary Conclusions:
1. **Cryptographic Identity Verification**: `lib/auth/tenant.ts` strictly enforces `supabase.auth.getUser()` for all tenant authorization decisions. The vulnerable pattern of relying on `getSession()` has been eradicated from the new tenant engine.
2. **Database-Driven Membership Isolation**: Workspace authorization is derived exclusively from trusted database records (`tenant_members`, `tenants`, `profiles`). Tenant IDs provided via cookies or query parameters are treated as untrusted hints and validated against verified memberships before selection.
3. **Safe Multi-Workspace Resolution**: When a user belongs to multiple active workspaces without a valid cookie hint, the engine mandates explicit selection (`WorkspaceSelectionRequiredError`) rather than arbitrarily picking a workspace.
4. **Explicit Capability Matrix**: `lib/auth/permissions.ts` implements a discrete, 19-permission matrix across `owner`, `admin`, `instructor`, and `assistant`. Linear numeric hierarchy and unintended privilege inheritance have been eliminated. Unknown roles and permissions deny by default.
5. **No Service-Role Leakage in Core Engine**: `lib/auth/tenant.ts` operates strictly over the authenticated client (`createServerClient`) subject to RLS, never using service-role privileges.
6. **Legacy Code Boundary**: The legacy single-teacher helper `assertTeacher()` in `lib/auth/assert.ts` and legacy actions in `actions/*.ts` still use `getSession()`, client cookies, and `createServerAdminClient()`. These are un-migrated legacy routines that Phase 3B2 is specifically chartered to refactor.

---

## 2. Security Findings Summary

| ID | Title | Severity | Location | Status |
| :--- | :--- | :---: | :--- | :--- |
| **SEC-3B1-001** | Legacy `assertTeacher()` Relies on Untrusted `edvora-role` Cookie & `getSession()` | **HIGH** | `lib/auth/assert.ts#L18-L30` | **Phase 3B2 Refactoring Mandate** |
| **SEC-3B1-002** | Legacy Server Actions Bypass Tenant Scoping via Service-Role Client | **HIGH** | `actions/*.ts` (announcements, lessons, notes, students) | **Phase 3B2 Refactoring Mandate** |
| **SEC-3B1-003** | Database Query Error in `profiles` Conflated with Account Deactivation | **LOW** | `lib/auth/tenant.ts#L261-L273` | **Remediation Recommended** |
| **SEC-3B1-004** | Subscription Status Query Failure Ignores Database Error Object | **LOW** | `lib/auth/tenant.ts#L344-L359` | **Fails Closed (Safe)** |
| **SEC-3B1-005** | Test Suite Relies Exclusively on In-Memory Supabase Mocks | **MEDIUM** | `tests/saas/auth-foundation.test.ts` | **Integration Testing Directive** |

---

## 3. In-Depth Security Findings

### SEC-3B1-001: Legacy `assertTeacher()` Relies on Untrusted `edvora-role` Cookie & `getSession()`
- **Severity**: **HIGH** (Pre-existing in codebase; targeted for removal in Phase 3B2).
- **Location**: [lib/auth/assert.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/assert.ts#L17-L31)
- **Vulnerability Description**:
  The legacy helper `assertTeacher()` contains an optimization fast-path:
  ```typescript
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? (await supabase.auth.getUser()).data.user;

  // Fast-path: check cached role cookie (0ms)
  const cookieStore = await cookies();
  const cachedRole = cookieStore.get("edvora-role")?.value;
  if (cachedRole === ROLES.TEACHER) {
    return user.id;
  }
  ```
  If a student account has an active session cookie, and the student manually sets document cookie `edvora-role=teacher`, `assertTeacher()` returns `user.id` without querying the database or verifying teacher credentials.
- **Exploitation Scenario**:
  An authenticated student invokes a legacy Server Action (e.g. `deleteAnnouncement` or `createLesson`). Because middleware skips Server Actions (`request.headers.get("next-action")`), `assertTeacher()` validates only the forged cookie and allows the student to execute the action via the service-role client.
- **Remediation in Phase 3B2**:
  Completely deprecate `assertTeacher()`. Refactor all Server Actions in `actions/*.ts` to call `requirePermission('batches:create_edit')`, `requirePermission('announcements:create_edit')`, etc., via `lib/auth/tenant.ts`.

---

### SEC-3B1-002: Legacy Server Actions Bypass Tenant Scoping via Service-Role Client
- **Severity**: **HIGH** (Legacy architectural debt; target of Phase 3B2/3B3).
- **Location**: `actions/announcements.ts`, `actions/lessons.ts`, `actions/notes.ts`, `actions/students.ts`
- **Vulnerability Description**:
  The existing Server Actions invoke `createServerAdminClient()`, which uses `SUPABASE_SERVICE_ROLE_KEY` to bypass Row Level Security. Furthermore, none of these actions currently inject `tenant_id` into their insert payloads or scope their update/delete queries by `tenant_id`.
- **Exploitation Scenario**:
  If Teacher A and Teacher B both exist on the platform, Teacher A calling legacy `deleteLesson(lessonId)` can delete a lesson belonging to Teacher B because `adminClient.from("lessons").delete().eq("id", lessonId)` omits tenant scoping.
- **Remediation in Phase 3B2**:
  As specified in Phase 3A.1, wrap every action in `const tenant = await requirePermission(...)` and inject `tenant.tenantId` into every database mutation.

---

### SEC-3B1-003: Database Query Error in `profiles` Conflated with Account Deactivation
- **Severity**: **LOW**
- **Location**: [lib/auth/tenant.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/tenant.ts#L261-L273)
- **Vulnerability Description**:
  In `getTenantContext()`:
  ```typescript
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
  ```
  If a PostgreSQL connection error, pool exhaustion, or timeout occurs (`profileErr`), the engine treats the failure as `status: "inactive_profile"`.
- **Impact**:
  While secure (it fails closed and denies access), masking an infrastructure database error as an account deactivation hampers operational debugging and returns misleading telemetry to users.
- **Recommended Correction in Phase 3B2**:
  Separate `profileErr` handling to throw a `DatabaseConnectionError` or return `status: "infrastructure_error"`.

---

### SEC-3B1-004: Subscription Status Query Failure Ignores Database Error Object
- **Severity**: **LOW** (Fails safe).
- **Location**: [lib/auth/tenant.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/tenant.ts#L344-L359)
- **Vulnerability Description**:
  `getTenantContext()` does not destructure or inspect the `error` object returned from `supabase.from("tenant_subscriptions")`. If the query fails, `sub` is undefined, `subStatus` falls back to `"pending"`, and `isSubscriptionActive` evaluates to `false`.
- **Security Assessment**:
  Because `isSubscriptionActive` defaults to `false`, mutations are blocked when the query fails. This satisfies the fail-closed security invariant.

---

### SEC-3B1-005: Test Suite Relies Exclusively on In-Memory Supabase Mocks
- **Severity**: **MEDIUM** (Testing limitation).
- **Location**: [tests/saas/auth-foundation.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/auth-foundation.test.ts#L48-L125)
- **Vulnerability Description**:
  The 14 tests in `auth-foundation.test.ts` validate application logic against mocked Supabase query responses. They do not execute against a live PostgreSQL database running RLS policies from migrations `00007`–`00014`.
- **Impact**:
  Mocked tests cannot detect PostgreSQL trigger bugs, RLS infinite recursion, or constraint violations that occur only inside the database engine.
- **Remediation**:
  Document clearly that mocked unit tests prove TypeScript application logic only, and schedule live RLS integration testing once migrations are applied.

---

## 4. Authentication Security Audit

| Check | Requirement | Audit Result | Evidence |
| :--- | :--- | :---: | :--- |
| **Auth Verification** | Sensitive paths mandate `supabase.auth.getUser()` | **PASS** | `lib/auth/tenant.ts#L210-L224` calls `supabase.auth.getUser()`. Never relies on `getSession()`. |
| **Session Invalidation** | Revoked sessions or deleted users rejected | **PASS** | `getUser()` performs an authoritative network handshake with Supabase Auth server. |
| **User Identity** | Identity strictly derived from authenticated token | **PASS** | `userId` is extracted from verified `user.id`. Callers cannot pass arbitrary user IDs. |
| **Schema Alignment** | Membership queries match PostgreSQL schema | **PASS** | Queries `tenant_members(id, role, tenant_id)` inner joined with `tenants(id, name, slug, is_active)`. |
| **Inactive Profiles** | Deactivated users rejected | **PASS** | `profiles.is_active = false` immediately returns `status: "inactive_profile"`. |
| **Inactive Tenants** | Suspended/inactive workspaces rejected | **PASS** | `tenants.is_active = false` filtered out, returning `status: "no_workspaces"`. |
| **Database Errors** | Query failures fail closed | **PASS** | Query errors in `profiles`, `tenant_members`, or `getUser` deny access. |
| **Privilege Escalation** | No accidental role elevation | **PASS** | Role is read from database record; cannot be overridden by client. |

---

## 5. Service-Role Bypass Assessment

A comprehensive repository search for `createServerAdminClient` and `SUPABASE_SERVICE_ROLE_KEY` confirms:

1. **Server-Side Isolation**: `createServerAdminClient` is defined in `lib/supabase/server.ts` and imports `next/headers` and `next/server`. It can never be bundled into browser code.
2. **Environment Variable Protection**: `SUPABASE_SERVICE_ROLE_KEY` does not carry the `NEXT_PUBLIC_` prefix, preventing Next.js from exposing it to client bundles.
3. **Core Tenant Engine Hygiene**: `lib/auth/tenant.ts` **does not** import or invoke `createServerAdminClient`. It executes strictly through the authenticated client (`createServerClient`) subject to RLS.
4. **Arbitrary Tenant ID Defense**: A caller passing an arbitrary `tenantId` in the `edvora-tenant` cookie cannot obtain access. The engine validates the candidate against `activeMemberships` derived from `user_id = user.id`. If the caller is not an active member of that tenant, the cookie is discarded.

---

## 6. Workspace Selection & Cookie Security

| Attack Vector | Evaluated Behavior | Result |
| :--- | :--- | :---: |
| **Valid Cookie Hint** | User belongs to Workspace A and B; cookie specifies Workspace B. | **Resolved** to Workspace B. |
| **Malformed Cookie** | Cookie contains SQL injection (`' OR '1'='1`) or invalid string. | **Discarded** via `isValidUuid()` regex check. |
| **Unauthorized Workspace** | Cookie contains UUID of a tenant the user is NOT a member of. | **Discarded**. User is not granted access to the foreign tenant. |
| **Single Workspace User** | User belongs to 1 workspace; cookie is missing or invalid. | **Auto-Resolved** safely to their only valid workspace. |
| **Multi-Workspace User** | User belongs to 2 workspaces; cookie is missing or invalid. | **Blocked**. Mandates selection via `WorkspaceSelectionRequiredError`. |
| **Cookie Manipulation** | Client sets cookie `edvora-tenant = <victim_tenant>`. | **Zero Authorization Effect**. Cookie is an unprivileged hint only. |
| **Student Hijacking** | Student sets `edvora-tenant` cookie. | **Blocked**. Student lacks `tenant_members` record; returns `no_workspaces`. |
| **Cross-Request Confusion** | Concurrent requests from different users. | **Isolated**. Zero module-level mutable state in `tenant.ts`. |

---

## 7. Permission Matrix Comparison

Every permission in `lib/auth/permissions.ts` was audited against `PHASE_3A1_ARCHITECTURE_REFINEMENT.md`:

```
===================================================================================
OPERATION / PERMISSION KEY            OWNER       ADMIN       INSTRUCTOR  ASSISTANT
===================================================================================
workspace:manage_settings             SPEC: YES   SPEC: NO    SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: NO    CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
workspace:delete                      SPEC: YES   SPEC: NO    SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: NO    CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
billing:manage_subscription           SPEC: YES   SPEC: NO    SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: NO    CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
billing:view_history                  SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
members:invite_manage                 SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
members:remove_staff                  SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
batches:create_edit                   SPEC: YES   SPEC: YES   SPEC: YES   SPEC: NO
                                      CODE: YES   CODE: YES   CODE: YES   CODE: NO
-----------------------------------------------------------------------------------
batches:delete                        SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
students:create_enroll                SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
students:view_list                    SPEC: YES   SPEC: YES   SPEC: YES   SPEC: YES
                                      CODE: YES   CODE: YES   CODE: YES   CODE: YES
-----------------------------------------------------------------------------------
students:edit_status                  SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
students:delete                       SPEC: YES   SPEC: YES   SPEC: NO    SPEC: NO
                                      CODE: YES   CODE: YES   CODE: NO    CODE: NO
-----------------------------------------------------------------------------------
lessons:create_edit                   SPEC: YES   SPEC: YES   SPEC: YES   SPEC: NO
                                      CODE: YES   CODE: YES   CODE: YES   CODE: NO
-----------------------------------------------------------------------------------
lessons:delete                        SPEC: YES   SPEC: YES   SPEC: YES   SPEC: NO
                                      CODE: YES   CODE: YES   CODE: YES   CODE: NO
-----------------------------------------------------------------------------------
notes:upload_manage                   SPEC: YES   SPEC: YES   SPEC: YES   SPEC: NO
                                      CODE: YES   CODE: YES   CODE: YES   CODE: NO
-----------------------------------------------------------------------------------
notes:delete                          SPEC: YES   SPEC: YES   SPEC: YES   SPEC: NO
                                      CODE: YES   CODE: YES   CODE: YES   CODE: NO
-----------------------------------------------------------------------------------
announcements:create_edit             SPEC: YES   SPEC: YES   SPEC: YES   SPEC: YES
                                      CODE: YES   CODE: YES   CODE: YES   CODE: YES
-----------------------------------------------------------------------------------
announcements:delete                  SPEC: YES   SPEC: YES   SPEC: YES   SPEC: NO
                                      CODE: YES   CODE: YES   CODE: YES   CODE: NO
-----------------------------------------------------------------------------------
storage:access_private_pdf            SPEC: YES   SPEC: YES   SPEC: YES   SPEC: YES
                                      CODE: YES   CODE: YES   CODE: YES   CODE: YES
===================================================================================
```
**Audit Verdict**: **100% Exact Match**. There are zero deviations between the Phase 3A.1 specification and the Phase 3B1 code.

---

## 8. Student Isolation Assessment

1. **Staff Endpoint Protection**:
   - If a student user logs in and attempts to invoke a Server Action protected by `requireTenantContext()`, the query on `tenant_members WHERE user_id = :student_id` returns `[]`.
   - The engine returns `{ status: "no_workspaces" }` and throws `TenantAuthError("Forbidden: You do not belong to an active workspace", "NO_WORKSPACES")`.
2. **Cookie Immunity**:
   - Student authentication and routing completely ignore `edvora-tenant`. Even if a student injects `edvora-tenant = <teacher_tenant_id>`, the cookie is disregarded because the student has no membership record in that tenant.
3. **Identity Decoupling**:
   - Students authenticate against `student_identities` (via synthetic email) and access materials strictly through `enrollments` and `batch_id` linkages.
   - Staff members authenticate via real email and access materials through `tenant_members` and `tenant_id`.
   - The two authorization realms are completely decoupled.

---

## 9. Test Quality Assessment

| Scenario | Tested Function | Test Category | Quality Rating | Assessment |
| :--- | :--- | :---: | :---: | :--- |
| **1. Unauthenticated** | `getTenantContext`, `requireTenantContext` | Mocked Supabase | **EXCELLENT** | Tests both result shape and error code throwing. |
| **2. Single Workspace** | `getTenantContext` | Mocked Supabase | **EXCELLENT** | Verifies auto-resolution without cookie. |
| **3. Multi-Workspace** | `getTenantContext`, `requireTenantContext` | Mocked Supabase | **EXCELLENT** | Verifies `WorkspaceSelectionRequiredError`. |
| **4. Valid Cookie** | `requireTenantContext` | Mocked Supabase | **EXCELLENT** | Verifies resolution to specifically requested tenant. |
| **5. Invalid Cookie** | `isValidUuid`, `getTenantContext` | Mocked Supabase | **EXCELLENT** | Tests SQL injection strings, non-UUIDs, empty values. |
| **6. Foreign Cookie** | `getTenantContext` | Mocked Supabase | **EXCELLENT** | Confirms foreign tenant is never selected. |
| **7. Inactive Profile** | `requireTenantContext` | Mocked Supabase | **EXCELLENT** | Confirms `is_active = false` profile is rejected. |
| **8. Inactive Tenant** | `requireTenantContext` | Mocked Supabase | **EXCELLENT** | Confirms `tenants.is_active = false` is rejected. |
| **9. Owner Perms** | `can`, `getPermissionsForRole`, `requireWorkspaceOwner` | Mixed Unit / Mock | **EXCELLENT** | Verifies all 19 permissions and owner assertion. |
| **10. Admin Perms** | `can`, `requirePermission`, `requireWorkspaceOwner` | Mixed Unit / Mock | **EXCELLENT** | Verifies operational rights and owner rejection. |
| **11. Instructor Perms** | `can` | Pure Unit | **EXCELLENT** | Verifies curriculum rights and admin/billing denial. |
| **12. Assistant Perms** | `can` | Pure Unit | **EXCELLENT** | Verifies support rights and content denial. |
| **13. Unknown Role** | `isValidRole`, `can` | Pure Unit | **EXCELLENT** | Verifies deny-by-default on arbitrary role strings. |
| **14. Unknown Perm** | `isValidPermission`, `can`, `assertCan` | Pure Unit | **EXCELLENT** | Verifies deny-by-default on arbitrary permissions. |

**Process & Runner Validation**:
- `npm run test:saas` executes via Node 24 native test runner (`node --experimental-strip-types --test`).
- When an assertion fails, the command exits with exit code `1` (verified during development).
- Zero false positives; all 14 tests exercise production code paths directly.

---

## 10. Additional Integration Test Recommendations

The following integration tests should be added to the test harness when live PostgreSQL database testing is permitted:

1. **Integration Test INT-001 (RLS Policy Verification)**:
   Authenticate as an instructor in Workspace A and query `tenant_members` directly. Assert that PostgREST returns rows only for Workspace A and zero rows for Workspace B.
2. **Integration Test INT-002 (Expired Subscription Behavior)**:
   Create a tenant with `tenant_subscriptions.status = 'expired'`. Assert that `requireTenantContext()` resolves successfully with `isSubscriptionActive = false`. Verify that read queries succeed while mutation actions throw `"Subscription expired"`.
3. **Integration Test INT-003 (Mixed Active/Inactive Workspaces)**:
   Assign a user to Workspace A (`is_active = true`) and Workspace B (`is_active = false`). Verify that `getTenantContext()` auto-resolves Workspace A without requiring manual selection.
4. **Integration Test INT-004 (Student Rejection)**:
   Authenticate as a student user (`role = 'student'`) with no `tenant_members` rows. Call `requireTenantContext()` and verify it throws `NO_WORKSPACES`.

---

## 11. Final Readiness Decision

> [!IMPORTANT]
> ### FINAL VERDICT: **APPROVED FOR PHASE 3B2**
>
> The Phase 3B1 foundation is architecturally robust, cryptographically sound, and implements the approved capability specification with 100% fidelity.
>
> **Conditions for Phase 3B2 Execution**:
> 1. All Server Actions in `actions/*.ts` must be refactored to replace `assertTeacher()` with `requirePermission()`.
> 2. `createServerAdminClient()` usage in Server Actions must be strictly scoped with verified `tenantContext.tenantId`.
> 3. Legacy `edvora-role` cookie reliance must be eliminated from all mutation routes.
>
> The codebase is approved to advance to Phase 3B2 upon authorization.
