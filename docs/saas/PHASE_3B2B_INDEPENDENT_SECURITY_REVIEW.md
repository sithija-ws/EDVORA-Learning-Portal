# Edvora — Phase 3B2-B Independent Security Review
## Student Authentication, Workspace Isolation & Dashboard Read Scoping

**Review Type:** Independent Application Security & Multi-Tenant Architecture Audit  
**Review Target:** Phase 3B2-B Implementation ([PHASE_3B2B_IMPLEMENTATION_REPORT.md](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/docs/saas/PHASE_3B2B_IMPLEMENTATION_REPORT.md))  
**Auditor Classification:** Principal SaaS Security Architect & PostgreSQL Security Auditor  
**Date:** November 24, 2026  
**Final Verdict:** **CORRECTIONS REQUIRED**

---

## 1. Executive Summary

This independent, adversarial security review evaluated the Phase 3B2-B deliverables for **Edvora**, a multi-tenant learning management system for independent tuition teachers in Sri Lanka. The scope of this review encompassed student authentication flows, anti-enumeration defenses, rate limiting, student workspace isolation, migration `00015` compatibility, permission-to-RLS consistency, teacher dashboard read query scoping, and automated test coverage.

### Key Audit Findings
1. **Significant Architectural Strides:**
   - **Student Authentication & Legacy Compatibility:** The workspace-aware synthetic identity mapping in [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts) successfully resolves active workspaces via `student_identities` while maintaining 100% backward compatibility with `default-workspace` student accounts without altering passwords or Supabase Auth records.
   - **Student Home Route Protection:** All student Server Component loaders have been migrated from `getSession()` to cryptographic `supabase.auth.getUser()`. Batch enrollment ownership gating (`notFound()`) is strictly enforced on lessons and notes.
   - **Teacher Dashboard Query Scoping:** All 17 teacher dashboard Server Component views now resolve `requireTenantContext()` and filter domain table queries by `.eq("tenant_id", tenant.tenantId)`.
   - **Schema & Migration Safety:** Migration `00015` remains safely unapplied. No application code currently depends on unapplied columns in the deployed database.
   - **Permission-to-RLS Alignment:** The capability matrix for `students:edit_status` in [lib/auth/permissions.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/permissions.ts) (owner, admin) was verified to match PostgreSQL RLS policy `profiles_update_tenant_admin` and `has_tenant_role(..., 'admin')`.

2. **Security Vulnerabilities & Critical Deficiencies Identified:**
   - **SEC-3B2B-MED-01 (Metadata Information Leakage Prior to RLS):** In 8 teacher and student detail/edit routes, `generateMetadata` executes unscoped single queries (`.from(...).select("name|title|full_name").eq("id", id).single()`) without `tenant_id` filtering or authentication verification. Prior to RLS migration `00011` deployment, any valid UUID allows an attacker to leak entity titles and student full names via page `<title>` tags.
   - **SEC-3B2B-MED-02 (In-Memory Rate Limiter Failure in Serverless Production):** The sliding-window rate limiter in [lib/auth/rate-limit.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/rate-limit.ts) operates entirely in local Node.js process memory (`Map`). Under Vercel serverless execution, state is fragmented across concurrent lambda instances, wiped on cold starts, vulnerable to IP spoofing via client-controlled `x-forwarded-for` headers, and subject to unbounded memory growth. It provides **zero meaningful brute-force protection in production**.
   - **SEC-3B2B-LOW-01 (Multi-Workspace Broadcast Notice Bleeding):** In [app/(student)/home/announcements/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(student)/home/announcements/page.tsx), when a student enrolled with multiple tuition teachers filters by a specific batch, broadcast announcements from foreign workspaces are erroneously included due to an un-scoped `|| a.is_broadcast` clause.
   - **SEC-3B2B-INFO-01 (Test Suite Reality Gap):** All 39 passing tests execute against simulated in-memory JavaScript mocks. No real PostgreSQL RLS isolation or multi-tenant database constraints have been validated against a live database.

---

## 2. Findings Grouped by Severity

| Finding ID | Severity | Category | Target Component | Status |
|---|:---:|---|---|:---:|
| **SEC-3B2B-MED-01** | **Medium** | Information Disclosure | `generateMetadata` in 8 dashboard & home pages | **Open** |
| **SEC-3B2B-MED-02** | **Medium** | Abuse Prevention Bypass | `lib/auth/rate-limit.ts` & `actions/auth.ts` | **Open** |
| **SEC-3B2B-LOW-01** | **Low** | Tenant Isolation Bleed | `app/(student)/home/announcements/page.tsx` | **Open** |
| **SEC-3B2B-INFO-01** | **Informational** | Verification Rigor | `tests/saas/*.test.ts` Mocked Test Classification | **Documented** |

---

### Detailed Findings

#### SEC-3B2B-MED-01: Cross-Tenant Information Disclosure in `generateMetadata`
- **Severity:** Medium (P2)
- **Files & Lines:**
  - [app/(teacher)/dashboard/batches/[batchId]/page.tsx#L20-L32](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/batches/[batchId]/page.tsx#L20-L32)
  - [app/(teacher)/dashboard/batches/[batchId]/edit/page.tsx#L16-L28](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/batches/[batchId]/edit/page.tsx#L16-L28)
  - [app/(teacher)/dashboard/batches/[batchId]/students/[studentId]/page.tsx#L18-L30](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/batches/[batchId]/students/[studentId]/page.tsx#L18-L30)
  - [app/(teacher)/dashboard/lessons/[lessonId]/page.tsx#L21-L33](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/lessons/[lessonId]/page.tsx#L21-L33)
  - [app/(teacher)/dashboard/lessons/[lessonId]/edit/page.tsx#L17-L29](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/lessons/[lessonId]/edit/page.tsx#L17-L29)
  - [app/(teacher)/dashboard/notes/[noteId]/page.tsx#L21-L33](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/notes/[noteId]/page.tsx#L21-L33)
  - [app/(teacher)/dashboard/notes/[noteId]/edit/page.tsx#L17-L29](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/notes/[noteId]/edit/page.tsx#L17-L29)
  - [app/(teacher)/dashboard/announcements/[announcementId]/edit/page.tsx#L17-L29](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/announcements/[announcementId]/edit/page.tsx#L17-L29)
  - [app/(student)/home/lessons/[lessonId]/page.tsx#L25-L37](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(student)/home/lessons/[lessonId]/page.tsx#L25-L37)
  - [app/(student)/home/notes/[noteId]/page.tsx#L25-L37](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(student)/home/notes/[noteId]/page.tsx#L25-L37)
- **Vulnerability Mechanism:**  
  Next.js executes `generateMetadata` independently before rendering page components. Across all 10 detail/edit pages, `generateMetadata` instantiates `createServerClient()` and queries the database using `.eq("id", paramId).single()` **without verifying tenant context or adding `.eq("tenant_id", tenant.tenantId)`**.
- **Impact Analysis:**  
  1. *Pre-RLS State:* Because migrations `00007` through `00014` are not yet applied to the active database, Supabase returns rows globally. An attacker (or a teacher from another workspace) requesting `/dashboard/batches/<uuid>` or `/dashboard/batches/<batchId>/students/<studentId>` will receive the exact batch title, lesson title, PDF title, or student's full legal name inside the HTTP response `<title>` tag.
  2. *Post-RLS State:* Once migration `00011` is deployed, queries for records outside the caller's workspace will return null, causing the fallback title (e.g., `"Batch Details — Edvora"`) to render. However, relying solely on future RLS violates Edvora's defense-in-depth architectural requirement.
- **Remediation Plan:**  
  Refactor `generateMetadata` in all affected files to resolve tenant context via `getTenantContext()` (or `auth.getUser()`) and apply tenant scoping:
  ```ts
  export async function generateMetadata({ params }: BatchDetailPageProps) {
    const { batchId } = await params;
    const tenantRes = await getTenantContext();
    if (tenantRes.status !== "resolved") {
      return { title: "Batch — Edvora" };
    }
    const supabase = await createServerClient();
    const { data: batch } = await supabase
      .from("batches")
      .select("name")
      .eq("id", batchId)
      .eq("tenant_id", tenantRes.context.tenantId)
      .maybeSingle();

    return {
      title: batch ? `${batch.name} — Edvora` : "Batch — Edvora",
    };
  }
  ```

---

#### SEC-3B2B-MED-02: Rate Limiter Ineffectiveness in Vercel Serverless Execution
- **Severity:** Medium (P2)
- **Files & Lines:**
  - [lib/auth/rate-limit.ts#L5-L12](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/rate-limit.ts#L5-L12)
  - [actions/auth.ts#L25-L40](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts#L25-L40)
  - [actions/auth.ts#L73-L85](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts#L73-L85)
- **Vulnerability Mechanism & Detailed Investigation:**
  1. *Multiple Concurrent Serverless Instances:* Vercel routes incoming requests across an autoscaling pool of independent AWS Lambda / Vercel Serverless Function instances. The rate limiter maintains state in a local JavaScript `Map`: `const store = new Map<string, RateLimitRecord>()`. Each concurrent instance has its own private, isolated heap. If an attacker runs 10 parallel threads, attempts are distributed across separate instances, multiplying the allowed password guessing attempts tenfold before any single instance triggers a lockout.
  2. *Cold Starts & Instance Recycling:* Serverless containers shut down after brief periods of inactivity (typically 5–15 minutes) or rotate dynamically. Whenever a container terminates or spins up, `store` is completely empty. A locked-out attacker can simply wait for a container recycle or trigger new instances to immediately bypass the lockout.
  3. *IP Header Spoofing Vulnerability:* In `actions/auth.ts`:
     ```ts
     const forwardedFor = headerStore.get("x-forwarded-for");
     if (forwardedFor) {
       return forwardedFor.split(",")[0].trim();
     }
     ```
     Reading the *first* IP in `x-forwarded-for` (`split(",")[0]`) trusts the leftmost header value, which is fully controlled by the HTTP client. An attacker can send arbitrary values (`X-Forwarded-For: 10.0.0.1`, `X-Forwarded-For: 10.0.0.2`) on every request, ensuring `rateLimitKey` is unique for every attempt and bypassing the rate limiter entirely.
  4. *Distributed Login Attacks:* Because the tracking key is `${clientIp}:${cleanUsername}`, an attacker with rotating proxies or a small botnet can execute unlimited credential stuffing against a specific student username without ever triggering a threshold breach.
  5. *Unbounded Memory Growth (DoS Risk):* Entries in `store` are only deleted when `checkRateLimit` is called again *for that identical key* after the expiration window (`now - record.firstAttemptAt > windowMs`). An attacker submitting requests with randomly generated usernames and IPs will permanently allocate records in the process memory that are never garbage collected, causing memory bloat.
  6. *Local Unit-Test Illusion:* In [tests/saas/student-auth-isolation.test.ts#L562-L585](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/student-auth-isolation.test.ts#L562-L585), tests run synchronously within a single persistent Node.js process where the `Map` remains in memory. The test suite proves the algorithmic sliding-window logic, but masks the total absence of persistence in serverless environments.
- **Recommended Zero-Budget Production Solution:**
  Because Edvora is hosted on Vercel with a Supabase PostgreSQL backend, **no paid third-party dependencies are required**:
  - **Option 1 (Recommended — Zero Budget, Supabase-Native):** Create an `unlogged` PostgreSQL table in Supabase (`auth_rate_limits`) with columns `(key TEXT PRIMARY KEY, attempts INT, first_attempt_at TIMESTAMPTZ, locked_until TIMESTAMPTZ)`. Wrap the check in a fast PostgreSQL stored procedure (`check_and_increment_rate_limit(p_key, p_max, p_window_seconds)`) executed via `adminClient.rpc()`. This guarantees atomic, cross-instance consistency across all Vercel instances with zero added monthly cost.
  - **Option 2 (Alternative — Upstash Redis Free Tier):** Connect `@upstash/ratelimit` over REST. Upstash provides 10,000 requests/day on its free tier, which easily covers initial tuition teacher workloads without cost.
  - **IP Resolution Fix:** On Vercel, read the trusted edge IP from `headerStore.get("x-vercel-ip")` or `headerStore.get("x-real-ip")`, rather than trusting the first element of `x-forwarded-for`.

---

#### SEC-3B2B-LOW-01: Cross-Tenant Broadcast Announcement Bleeding for Multi-Workspace Students
- **Severity:** Low (P3)
- **Files & Lines:**
  - [app/(student)/home/announcements/page.tsx#L123-L141](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(student)/home/announcements/page.tsx#L123-L141)
- **Vulnerability Mechanism:**  
  When a student belongs to multiple tuition teachers (e.g., Tenant 1: "Apex Maths", Tenant 2: "Sigma Physics"), `studentTenantIds` contains `[Tenant 1, Tenant 2]`. On the announcements page, the student can filter by a specific batch belonging to Tenant 1 (`effectiveBatchFilter = batchId`). However, the filtering logic is:
  ```ts
  const studentAnnouncements = allNotices.filter((a) => {
    if (effectiveBatchFilter) {
      return scopedAnnIdSet.has(a.id) || a.is_broadcast;
    }
    return a.is_broadcast || scopedAnnIdSet.has(a.id);
  });
  ```
  `allNotices` contains announcements from *both* Tenant 1 and Tenant 2. Because `a.is_broadcast` is true for broadcast notices from Tenant 2, Tenant 2's broadcast notices (e.g., "Physics class canceled this Friday") appear inside the feed when the student has selected Tenant 1's Maths batch.
- **Impact:** Information bleed and operational confusion between independent tuition teachers.
- **Remediation Plan:**  
  When `effectiveBatchFilter` is active, resolve the batch's owning `tenant_id` and restrict broadcast notices to that specific tenant:
  ```ts
  const selectedBatchTenantId = enrolledBatches.find(b => b.id === effectiveBatchFilter)?.tenant_id;
  const studentAnnouncements = allNotices.filter((a) => {
    if (effectiveBatchFilter) {
      return scopedAnnIdSet.has(a.id) || (a.is_broadcast && a.tenant_id === selectedBatchTenantId);
    }
    return a.is_broadcast || scopedAnnIdSet.has(a.id);
  });
  ```

---

#### SEC-3B2B-INFO-01: Disconnect Between Mocked Unit Tests and Live Database Isolation
- **Severity:** Informational
- **Files & Lines:**
  - [tests/saas/auth-foundation.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/auth-foundation.test.ts)
  - [tests/saas/actions-security.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/actions-security.test.ts)
  - [tests/saas/student-auth-isolation.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/student-auth-isolation.test.ts)
- **Observation:**  
  The implementation report claims that student authorization and workspace isolation are "verified by 39 passing automated tests." However, an inspection of the test suite reveals that **100% of these tests run against JavaScript objects and simulated mock Supabase clients**. None of the tests execute against a real PostgreSQL database with active Row-Level Security policies. While mock tests are valuable for verifying application logic and gate branching, they do not prove that PostgreSQL RLS policies or database foreign keys enforce isolation.

---

## 3. Student Authentication & Anti-Enumeration Verification

An audit of [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts) was conducted against every requirement:

1. **Active Workspace Resolution:**  
   In lines 128–135, `cleanWorkspace` queries `tenants` by slug with `.ilike("slug", cleanWorkspace)`. It explicitly verifies `if (!tenantData || !tenantData.is_active)` and terminates with a generic error if the workspace is inactive or does not exist.
2. **Workspace-Scoped Username Lookup:**  
   In lines 145–158, username lookup strictly applies `.eq("tenant_id", tenantData.id).ilike("username", cleanUsername)`. A student username from Tenant B cannot authenticate against Tenant A.
3. **Synthetic Identity Privacy:**  
   Internal synthetic emails (`student_<tenant_id>_<username>@student.edvora.internal`) are resolved via server-side service-role queries and passed directly to `supabase.auth.signInWithPassword`. Synthetic emails are never included in cookies, action responses, or client payloads.
4. **Uniform Anti-Enumeration Responses:**  
   The action returns identical error messages (`"Invalid workspace, username, or password"`) across all failure scenarios:
   - Non-existent workspace slug
   - Deactivated workspace
   - Non-existent username within a valid workspace
   - Incorrect password
   - Failed Supabase authentication
5. **Legacy Default-Workspace Compatibility:**  
   In lines 164–191, when `workspace` is omitted, the action first attempts resolution against the `default-workspace` tenant in `student_identities`. If unmapped, it falls back to `${cleanUsername}@${STUDENT_EMAIL_DOMAIN}`. Existing student credentials, passwords, and enrollments remain completely undisturbed.
6. **Student Privilege Boundary:**  
   In line 206, the authenticated user's role is verified from `profiles`. If `profile.role === 'student'`, the session is redirected to `/home`. Students cannot access `/dashboard`, as `middleware.ts` redirects them to `/home`, and Server Actions invoke `requireTenantContext()`, which checks `tenant_members` (where students have zero rows) and rejects with `NO_WORKSPACES`.

---

## 4. Student Workspace Isolation & Route Inspection

Every student route and component in `app/(student)/home/**` was audited:

| Route / View | Verification Method | Tenant / Batch Scoping Verified | Cross-Tenant Leakage Risk |
|---|---|---|:---:|
| `app/(student)/home/page.tsx` | `auth.getUser()` | Announcements scoped to `studentTenantIds` | **Secure** |
| `app/(student)/home/announcements/page.tsx` | `auth.getUser()` | Announcements scoped to `studentTenantIds` | **Minor Bleed** (See SEC-3B2B-LOW-01) |
| `app/(student)/home/lessons/page.tsx` | `auth.getUser()` | Filtered by `enrolledBatchIds` & `studentTenantIds` | **Secure** |
| `app/(student)/home/lessons/[lessonId]/page.tsx` | `auth.getUser()` | Verified `enrolledBatchIds` & `studentTenantIds` | **Secure** (See SEC-3B2B-MED-01 for metadata) |
| `app/(student)/home/notes/page.tsx` | `auth.getUser()` | Filtered by `enrolledBatchIds` & `studentTenantIds` | **Secure** |
| `app/(student)/home/notes/[noteId]/page.tsx` | `auth.getUser()` | Verified `enrolledBatchIds` & `studentTenantIds` | **Secure** (See SEC-3B2B-MED-01 for metadata) |

**Key Findings:**
- In all student views, the user ID is derived directly from the cryptographic session token (`auth.getUser()`). No student ID can be forged through query parameters or path variables.
- Direct object reference (IDOR) attacks against lessons and notes are prevented: requesting `/home/lessons/<foreign-lesson-id>` verifies that `lessonBatches` contains at least one batch in `enrolledBatchIds` and calls `notFound()` if unauthorized.

---

## 5. Migration 00015 Compatibility & Schema Integrity

Migration [00015_student_workspace_active_status.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00015_student_workspace_active_status.sql) was audited:

1. **Application Code Dependency Check:**  
   A full-text search across all TypeScript files confirms that **zero application code currently references `student_identities.is_active`**. In `actions/students.ts`, `toggleStudentActive` continues to update `profiles.is_active`.
2. **Database Field Compatibility:**  
   `types/database.ts` (generated from the currently applied migrations) does not contain `is_active` under `student_identities`. The application code strictly adheres to the deployed schema and will not break.
3. **Safety of Future Execution:**  
   - `ALTER TABLE public.student_identities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;` is safely additive.
   - All existing rows will default to `true`, ensuring no existing student loses access upon execution.
   - The updated `is_tenant_student(UUID)` function cleanly includes `AND si.is_active = true`, maintaining full backward compatibility.

---

## 6. Permission and RLS Consistency Verification

An adversarial comparison was conducted between the application capability matrix and the PostgreSQL RLS definitions:

| Component | Layer | Allowed Roles | Authority Reference |
|---|---|---|---|
| `students:edit_status` | Application | `owner`, `admin` | [lib/auth/permissions.ts#L84-L102](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/permissions.ts#L84-L102) |
| `profiles_update_tenant_admin` | Database RLS | `owner`, `admin` | `00011_multi_tenant_rls_policies.sql:459` |
| `has_tenant_role(..., 'admin')` | Database Function | Level $\ge$ 30 (`owner`=40, `admin`=30) | `00010_tenant_auth_functions.sql:84-119` |

**Conclusion:**  
The earlier concern raised in Phase 3B2-A (`SEC-3B2A-INFO-02`) has been resolved. In `00010_tenant_auth_functions.sql`, `has_tenant_role(tenant_id, 'admin')` evaluates `v_user_level >= 30`, which permits both `admin` (30) and `owner` (40), while denying `instructor` (20) and `assistant` (10). In `lib/auth/permissions.ts`, `students:edit_status` is granted strictly to `owner` and `admin`. **The application authorization matrix and PostgreSQL RLS policies are 100% synchronized.**

---

## 7. Teacher Dashboard Read Security Audit

All 17 teacher dashboard Server Component pages were audited:

| Page Path | Verified Tenant Context | Query Filters Applied | Risk Assessment |
|---|:---:|---|:---:|
| `app/(teacher)/dashboard/page.tsx` | Yes (`requireTenantContext`) | `batches`, `enrollments` scoped to `tenantId` | **Secure** |
| `app/(teacher)/dashboard/batches/page.tsx` | Yes (`requireTenantContext`) | `batches`, `enrollments` scoped to `tenantId` | **Secure** |
| `app/(teacher)/dashboard/batches/new/page.tsx` | N/A | Client form component, no DB reads | **Secure** |
| `app/(teacher)/dashboard/batches/[batchId]/page.tsx` | Yes (`requireTenantContext`) | All 6 tables & junctions scoped to `tenantId` | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/batches/[batchId]/edit/page.tsx` | Yes (`requireTenantContext`) | `batches` scoped to `tenantId` | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/batches/[batchId]/students/new/page.tsx` | Yes (`requireTenantContext`) | `batches` scoped to `tenantId` | **Secure** |
| `app/(teacher)/dashboard/batches/[batchId]/students/[studentId]/page.tsx` | Yes (`requireTenantContext`) | Student verified in tenant before load | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/lessons/page.tsx` | Yes (`requireTenantContext`) | `batches`, `lesson_batches`, `lessons` scoped | **Secure** |
| `app/(teacher)/dashboard/lessons/new/page.tsx` | Yes (`requireTenantContext`) | `batches` scoped to `tenantId` | **Secure** |
| `app/(teacher)/dashboard/lessons/[lessonId]/page.tsx` | Yes (`requireTenantContext`) | `lessons`, junctions, batches scoped | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/lessons/[lessonId]/edit/page.tsx` | Yes (`requireTenantContext`) | `lessons`, junctions, batches scoped | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/notes/page.tsx` | Yes (`requireTenantContext`) | `batches`, `note_batches`, `notes` scoped | **Secure** |
| `app/(teacher)/dashboard/notes/new/page.tsx` | Yes (`requireTenantContext`) | `batches` scoped to `tenantId` | **Secure** |
| `app/(teacher)/dashboard/notes/[noteId]/page.tsx` | Yes (`requireTenantContext`) | `notes`, junctions, batches scoped | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/notes/[noteId]/edit/page.tsx` | Yes (`requireTenantContext`) | `notes`, junctions, batches scoped | **Secure** (See MED-01 for metadata) |
| `app/(teacher)/dashboard/announcements/page.tsx` | Yes (`requireTenantContext`) | `batches`, junctions, announcements scoped | **Secure** |
| `app/(teacher)/dashboard/announcements/new/page.tsx` | Yes (`requireTenantContext`) | `batches` scoped to `tenantId` | **Secure** |
| `app/(teacher)/dashboard/announcements/[announcementId]/edit/page.tsx` | Yes (`requireTenantContext`) | `announcements`, junctions, batches scoped | **Secure** (See MED-01 for metadata) |

**Verdict:** The main body of every Server Component loader enforces strict tenant boundaries. However, `generateMetadata` in 8 pages lacks tenant scoping (documented under **SEC-3B2B-MED-01**).

---

## 8. Test Suite Classification

The automated test suite in `tests/saas/` was classified according to real execution characteristics:

| Test File | Test Count | Classification | Real PostgreSQL RLS Evaluated? |
|---|:---:|---|:---:|
| `auth-foundation.test.ts` | 14 | Unit Tests & Mocked Context Integration | **No** (Mock Client) |
| `actions-security.test.ts` | 11 | Mocked Server Action Query Scoping | **No** (Mock Client) |
| `student-auth-isolation.test.ts` | 14 | Unit Tests & Mocked Auth Resolution | **No** (Mock Client) |
| **Total** | **39** | **100% Mock-Based / Unit Tests** | **0% Real PostgreSQL** |

**Auditor Note:** While the tests accurately verify JavaScript branching logic, they do not simulate PostgreSQL row-level security or foreign key rejection. The project must maintain clear distinction: database-level isolation remains unproven until integration tests execute against a running Supabase PostgreSQL database.

---

## 9. Required Remediation Checklist for Phase 3B2-C

Before proceeding to Phase 3B2-C, the following corrections must be addressed:

- [ ] **Fix SEC-3B2B-MED-01 (`generateMetadata` Scoping):** Update `generateMetadata` in all 10 detail/edit pages to obtain caller context via `getTenantContext()` (or `auth.getUser()`) and apply `.eq("tenant_id", tenantId)`.
- [ ] **Fix SEC-3B2B-MED-02 (Serverless-Safe Rate Limiting):**
  - Implement a zero-budget Supabase PostgreSQL-backed rate limiter (`auth_rate_limits` table + atomic RPC function) or integrate Upstash Redis.
  - In `actions/auth.ts`, resolve client IP from trusted Vercel edge headers (`x-vercel-ip` or `x-real-ip`) rather than spoofable client-supplied `x-forwarded-for` prefixes.
- [ ] **Fix SEC-3B2B-LOW-01 (Multi-Workspace Announcement Isolation):** In `app/(student)/home/announcements/page.tsx`, ensure `is_broadcast` notices are filtered by the owning tenant of the selected batch when `effectiveBatchFilter` is active.

---

## 10. Final Audit Verdict

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                         FINAL VERDICT:                                    ║
║                      CORRECTIONS REQUIRED                                 ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**Justification:**  
While student authentication logic and teacher dashboard page loaders are solidly constructed, **SEC-3B2B-MED-01** exposes cross-tenant entity titles and student full names via unscoped `generateMetadata` queries, and **SEC-3B2B-MED-02** leaves the login endpoint completely defenseless against automated brute-force attacks in Vercel serverless production. These issues must be remediated to ensure production readiness.
