# Phase 3B2-A Independent Security Review
## Multi-Tenant Authorization Migration for Existing Server Actions

**Review Type:** Independent Application Security & Architecture Audit  
**Review Target:** Phase 3B2-A Implementation ([PHASE_3B2A_IMPLEMENTATION_REPORT.md](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/docs/saas/PHASE_3B2A_IMPLEMENTATION_REPORT.md))  
**Auditor Classification:** Senior SaaS Security & Multi-Tenant Database Auditor  
**Date:** November 23, 2026  
**Final Verdict:** **APPROVED FOR PHASE 3B2-B**

---

## 1. Executive Summary

This independent security review examined the codebase following the Phase 3B2-A migration. All existing staff Server Actions (`actions/batches.ts`, `actions/lessons.ts`, `actions/notes.ts`, `actions/announcements.ts`, `actions/students.ts`) and legacy assertion helpers (`lib/auth/assert.ts`) were audited line by line.

### Key Audit Findings
1. **Zero Trust in Client-Supplied Tenant Identifiers:** All staff actions derive their operational context strictly from `requirePermission(<TenantPermission>)`, which resolves tenant membership through server-side `auth.getUser()` and active database memberships in `tenant_members`. Client-supplied tenant IDs and cookies are completely ignored for authorization.
2. **Eradication of Legacy Cookie Authorization:** No action inspects `edvora-role` or treats `edvora-tenant` as proof of entitlement. `assertTeacher()` in [assert.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/assert.ts) is deprecated and delegates exclusively to `requireTenantContext()`.
3. **Pervasive Tenant Query Scoping:** Every database mutation (`INSERT`, `UPDATE`, `DELETE`) in staff actions explicitly enforces `tenant_id = tenant.tenantId`. Junction table updates (`lesson_batches`, `note_batches`, `announcement_batches`, `enrollments`) validate related batch ownership against the caller's tenant prior to association, preventing cross-tenant linking.
4. **Controlled Service-Role Privileges:** `createServerAdminClient()` has been completely removed from `batches.ts`, `lessons.ts`, `notes.ts`, and `announcements.ts`. In `students.ts`, service-role usage is strictly bounded to the Supabase Auth Admin API (`createUser`, `deleteUser`), executing only after explicit permission checks (`students:create_enroll`, `students:delete`) and tenant ownership validation.
5. **Storage Isolation Compliance:** Note uploads in [notes.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/notes.ts) enforce tenant-prefixed storage paths (`{tenant_id}/*`), matching the prepared storage RLS policies in migration `00012_storage_tenant_policies.sql`. File deletions strictly check for the tenant prefix before attempting storage object deletion.
6. **Zero Critical / Zero High Vulnerabilities:** The Server Action migration contains no critical or high severity security vulnerabilities. Minor low-severity defense-in-depth improvements and schema alignment nuances are documented below for Phase 3B2-B.

---

## 2. Findings Grouped by Severity

### Critical Severity (P0)
*None identified.*

### High Severity (P1)
*None identified.*

### Medium Severity (P2)
*None identified.*

### Low Severity (P3)

#### SEC-3B2A-LOW-01: Conditional Upfront Tenant Ownership Check in `updateLesson`
- **File:** [actions/lessons.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/lessons.ts#L220-L245)
- **Lines:** 220–245
- **Description:** In `updateLesson`, the verification that `lessonId` belongs to `tenant.tenantId` is executed inside the block `if (Object.keys(lessonUpdates).length > 0)`. If a client submits a form containing *only* `batch_ids` with no lesson field changes (`title`, `description`, `youtube_url`, `sort_order` all omitted or empty), the upfront update check is skipped.
- **Impact Analysis:** 
  - When migration `00009` is applied, the PostgreSQL composite foreign key `fk_lb_lesson_tenant` (`FOREIGN KEY (lesson_id, tenant_id) REFERENCES public.lessons(id, tenant_id)`) will reject any junction insertion if `lesson_id` belongs to another tenant.
  - In `lesson_batches` synchronization, existing assignments are fetched with `.eq("tenant_id", tenant.tenantId)`, and deletes are scoped by `.eq("tenant_id", tenant.tenantId)`. Therefore, cross-tenant records cannot be deleted.
  - However, in defense-in-depth terms, `updateLesson` should unconditionally verify that `lessonId` belongs to `tenant.tenantId` at the start of the action (identical to the pattern used in `actions/announcements.ts` and `actions/notes.ts`).
- **Remediation Recommendation for Phase 3B2-B:** Add an unconditional existence check at the start of `updateLesson`:
  ```ts
  const { data: existingLesson, error: verifyError } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.tenantId)
    .single();
  if (verifyError || !existingLesson) {
    return { success: false, data: null, error: "Lesson not found or unauthorized" };
  }
  ```

---

### Informational / Architectural Observations

#### SEC-3B2A-INFO-01: Global Profile Deactivation in `toggleStudentActive`
- **File:** [actions/students.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/students.ts#L402-L406)
- **Lines:** 402–406
- **Observation:** `toggleStudentActive` updates `profiles.is_active`. While the action verifies that the student belongs to the caller's tenant via `student_identities`, `public.profiles` is a global table. In the future Model A architecture, if a student account is shared across multiple tuition teachers' workspaces, deactivating `profiles.is_active` would deactivate the student across all workspaces.
- **Recommendation:** When multi-tenant student identities are fully utilized in Phase 3C, introduce an `is_active` status flag on `student_identities` (or `enrollments`) so that a teacher deactivates a student only within their specific workspace.

#### SEC-3B2A-INFO-02: RLS Role Level Alignment for Student Profile Updates
- **File:** `supabase/migrations/00011_multi_tenant_rls_policies.sql` (Lines 459–478) vs [lib/auth/permissions.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/permissions.ts#L104)
- **Observation:** In `lib/auth/permissions.ts`, the `instructor` role is granted `students:edit_status`. However, in migration `00011`, the RLS policy `profiles_update_tenant_admin` restricts profile updates to `has_tenant_role(si.tenant_id, 'admin')` (levels 30+; `admin` and `owner`). Once migration `00011` is applied, if an `instructor` attempts to update a student's profile via standard RLS, the database policy will deny the update.
- **Recommendation:** Align the capability matrix in Phase 3C: either update `profiles_update_tenant_admin` to allow `'instructor'` (`has_tenant_role(si.tenant_id, 'instructor')`), or restrict `students:edit_status` in `permissions.ts` to `admin` and `owner`.

#### SEC-3B2A-INFO-03: Read-Only Dashboard Server Components Not Yet Scoped by Tenant
- **Files:** `app/(teacher)/dashboard/batches/page.tsx`, `app/(teacher)/dashboard/lessons/page.tsx`, `app/(teacher)/dashboard/notes/page.tsx`, `app/(teacher)/dashboard/announcements/page.tsx`
- **Observation:** Phase 3B2-A strictly focused on mutating Server Actions. The Read-Side Server Components (listing pages) still execute `.from("batches").select("*")` without `.eq("tenant_id", tenant.tenantId)`. These pages currently rely on future PostgreSQL RLS (`00011`) for isolation.
- **Recommendation:** In Phase 3B2-B / 3C, update all dashboard page loaders to invoke `requireTenantContext()` and explicitly filter queries by `tenant_id` for defense-in-depth, preventing cross-tenant data leakage if a teacher has memberships in multiple workspaces.

#### SEC-3B2A-INFO-04: Student Login Pending Phase 3B2-B / 3C Migration
- **File:** [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts#L49-L52)
- **Observation:** `actions/auth.ts` remains in its legacy state by design per Phase 3B2-A instructions. Students provisioned with synthetic emails (`std_<uuid>@edvora.internal`) cannot log in via `actions/auth.ts` until the tenant-aware student authentication flow is implemented in Phase 3B2-B.

---

## 3. Comprehensive Action-by-Action Audit

| File | Server Action | Permission Checked | Auth User Verification | Tenant Scoping Enforced | Junction Ownership Validated | Service-Role Client Usage | Audit Assessment |
|---|---|---|---|---|---|---|:---:|
| `actions/batches.ts` | `createBatch` | `batches:create_edit` | Yes (`auth.getUser`) | Yes (`tenant_id: tenant.tenantId`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/batches.ts` | `updateBatch` | `batches:create_edit` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/batches.ts` | `toggleBatchArchive` | `batches:create_edit` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/batches.ts` | `deleteBatch` | `batches:delete` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/lessons.ts` | `createLesson` | `lessons:create_edit` | Yes (`auth.getUser`) | Yes (`tenant_id: tenant.tenantId`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** |
| `actions/lessons.ts` | `updateLesson` | `lessons:create_edit` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** (See LOW-01) |
| `actions/lessons.ts` | `deleteLesson` | `lessons:delete` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/lessons.ts` | `reorderLessons` | `lessons:create_edit` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/announcements.ts` | `createAnnouncement` | `announcements:create_edit` | Yes (`auth.getUser`) | Yes (`tenant_id: tenant.tenantId`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** |
| `actions/announcements.ts` | `updateAnnouncement` | `announcements:create_edit` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** |
| `actions/announcements.ts` | `deleteAnnouncement` | `announcements:delete` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/announcements.ts` | `toggleAnnouncementPin` | `announcements:create_edit` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/notes.ts` | `createNote` | `notes:upload_manage` | Yes (`auth.getUser`) | Yes (`tenant_id: tenant.tenantId`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** |
| `actions/notes.ts` | `updateNote` | `notes:upload_manage` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** |
| `actions/notes.ts` | `deleteNote` | `notes:delete` | Yes (`auth.getUser`) | Yes (`.eq("id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/students.ts` | `createStudent` | `students:create_enroll` | Yes (`auth.getUser`) | Yes (`tenant_id: tenant.tenantId`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | Auth Admin API only | **SECURE** |
| `actions/students.ts` | `updateStudent` | `students:edit_status` | Yes (`auth.getUser`) | Yes (`.eq("student_id").eq("tenant_id")`) | Yes (`.in("id", batch_ids).eq("tenant_id")`) | None (`createServerClient`) | **SECURE** |
| `actions/students.ts` | `toggleStudentActive` | `students:edit_status` | Yes (`auth.getUser`) | Yes (`.eq("student_id").eq("tenant_id")`) | N/A | None (`createServerClient`) | **SECURE** |
| `actions/students.ts` | `unenrollStudentFromBatch` | `students:edit_status` | Yes (`auth.getUser`) | Yes (`.eq("student_id").eq("batch_id").eq("tenant_id")`) | Yes (Batch verified in tenant) | None (`createServerClient`) | **SECURE** |
| `actions/students.ts` | `deleteStudent` | `students:delete` | Yes (`auth.getUser`) | Yes (`.eq("student_id").eq("tenant_id")`) | N/A | Auth Admin API only | **SECURE** |
| `lib/auth/assert.ts` | `assertTeacher` | Deprecated Helper | Yes (`auth.getUser` via `requireTenantContext`) | Yes (Resolves active tenant) | N/A | None | **SECURE** |

---

## 4. Service-Role Operations Security Audit

A repository-wide search was conducted for `createServerAdminClient()`. The client is instantiated in only two places:

1. **`actions/students.ts:createStudent` (Line 104)**:
   - **Gating:** Guarded by `requirePermission("students:create_enroll")`. Only `owner` and `admin` roles possess this permission; `instructor` and `assistant` are denied immediately.
   - **Scope:** Used exclusively for `adminClient.auth.admin.createUser()` to provision an unguessable synthetic auth user (`std_<uuid>@edvora.internal`).
   - **Rollback Consistency:** If any subsequent database insert fails (`profiles`, `student_identities`, or `enrollments`), compensating delete operations cascade in reverse order and delete the auth user via `adminClient.auth.admin.deleteUser(newUserId)`. No orphaned auth users are left behind.
2. **`actions/students.ts:deleteStudent` (Line 525)**:
   - **Gating:** Guarded by `requirePermission("students:delete")`. Only `owner` and `admin` roles possess this permission.
   - **Target Verification:** The target `studentId` is verified against `student_identities` (`WHERE tenant_id = tenant.tenantId AND student_id = studentId`). An admin of Tenant A cannot delete a student belonging to Tenant B.
   - **Safe Cascading:** Deletes enrollments and student identities scoped to `tenant.tenantId`. If and only if the student has no other tenant identities, it purges the profile and invokes `adminClient.auth.admin.deleteUser(studentId)`.

**Verdict on Service-Role Usage:** All service-role operations are strictly justified, authorization-gated, and tenant-bounded.

---

## 5. Storage Security Audit

`actions/notes.ts` was audited against the storage policies in migration `00012_storage_tenant_policies.sql`:

1. **Upload Path Enforcement:**
   - In `createNote` and `updateNote`, files are uploaded to:
     `const storagePath = `${tenant.tenantId}/${Date.now()}_${sanitizedName}`;`
   - This directly matches policy `notes_storage_upload_tenant` in migration 00012:
     `split_part(name, '/', 1) = tenant_id` AND `has_tenant_role(tenant_id, 'instructor')`.
2. **Deletion Security:**
   - In `deleteNote`, storage removal extracts the file path from `file_url` and checks:
     `if (filePath.startsWith(`${tenant.tenantId}/`))`
   - Files without the tenant prefix or belonging to other paths cannot be deleted through this action.
3. **MIME Type and Size Validation:**
   - Strictly enforces `file.type === "application/pdf"`, `.endsWith(".pdf")`, and `MAX_PDF_FILE_SIZE` (50 MB).

---

## 6. Audit of the Automated Test Suite

The automated test suite was evaluated to distinguish what the tests prove versus what they simulate:

### A. Test Inventory
1. **`tests/saas/auth-foundation.test.ts`**: 14 tests covering `lib/auth/permissions.ts` and `lib/auth/tenant.ts`.
2. **`tests/saas/actions-security.test.ts`**: 11 tests covering the 10 Phase 3B2-A security scenarios plus backwards compatibility.

### B. Classification of Test Assertions

| Test Category | Actual Coverage in Current Suite | What Is Proven | What Is NOT Proven |
|---|---|---|---|
| **Pure Unit Tests** | `can()`, `assertCan()`, `isValidRole()`, `isValidPermission()`, `getPermissionsForRole()` | Proves that the TypeScript capability matrix correctly grants/denies permissions per role without privilege escalation. | Does not interact with database or network. |
| **Mock-Based Auth Tests** | `getTenantContext()`, `requireTenantContext()`, `requirePermission()`, `requireWorkspaceOwner()` | Proves that missing tokens, inactive profiles, inactive tenants, missing memberships, and multi-workspace ambiguity correctly throw structured `TenantAuthError` exceptions. | Uses simulated Supabase responses; does not test real PostgreSQL triggers or network latency. |
| **Query-Scoping Contract Tests** | Capturing query builders in `actions-security.test.ts` | Proves that Server Action logic appends `.eq("tenant_id", tenant.tenantId)` to all queries and handles foreign records as not found. | Does not execute against real PostgreSQL engine or foreign key constraints. |
| **PostgreSQL RLS Integration Tests** | *Zero tests in current suite* | N/A | **Does NOT prove real PostgreSQL RLS policy enforcement.** Migrations `00007`–`00014` remain unapplied per project instructions. |

**Audit Note on Test Reality:** The test suite thoroughly validates application-layer authorization logic and query scoping contracts, but real database isolation can only be certified once migrations `00007`–`00014` are applied against an active Supabase PostgreSQL instance in Phase 4.

---

## 7. Remaining Legacy Boundaries Scan

A repository-wide search was performed for legacy artifacts:

1. **`assertTeacher(`**: 
   - Found only in [lib/auth/assert.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/assert.ts) as a deprecated delegate.
   - Zero occurrences in `actions/`, `app/`, or `components/`.
2. **`createServerAdminClient(`**:
   - Found only in [actions/students.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/students.ts) for auth admin user creation/deletion, and [lib/supabase/server.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/supabase/server.ts) for its definition.
   - Zero occurrences in `batches.ts`, `lessons.ts`, `notes.ts`, `announcements.ts`.
3. **`getSession(`**:
   - Zero occurrences in `actions/` or `lib/auth/`.
   - Found only in [lib/supabase/middleware.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/supabase/middleware.ts#L46) for session cookie refreshing (followed by verified `getUser()`).
4. **`edvora-role`**:
   - Set in `actions/auth.ts` upon login as an edge routing hint.
   - Never used for authorization in any Server Action.

---

## 8. Remaining Database Integration Requirements (Phase 4 Checklist)

The following database-level integration steps must be completed when migrations are officially applied:
1. **Apply Migrations 00007–00014:**
   - Execute in strict sequence: `00007` (infrastructure) -> `00008` (backfill) -> `00009` (composite FKs) -> `00010` (functions) -> `00011` (RLS) -> `00012` (storage) -> `00013` (billing) -> `00014` (quotas).
2. **Verify Composite Foreign Key Rejection:**
   - Confirm in PostgreSQL that inserting into `lesson_batches`, `note_batches`, `announcement_batches`, or `enrollments` with mismatched `tenant_id` raises foreign key violation `23503`.
3. **Verify Storage RLS with Authenticated JWT:**
   - Confirm that attempting to upload to `notes` under another tenant's prefix raises Supabase Storage RLS error.

---

## 9. Readiness Statement & Final Verdict

The migration of staff Server Actions meets high security standards. Authorization is strictly server-enforced, unverified cookies have been eliminated from authorization logic, tenant scoping is enforced across all mutating queries, and service-role usage is strictly controlled.

### Final Verdict: **APPROVED FOR PHASE 3B2-B**

The application is cleared to proceed to **Phase 3B2-B: Teacher Registration, Multi-Workspace Switching & Navigation**.
