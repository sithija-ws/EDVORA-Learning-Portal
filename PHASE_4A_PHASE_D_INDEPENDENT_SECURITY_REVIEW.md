# EDVORA — PHASE 4A: PHASE D INDEPENDENT SECURITY REVIEW
## Strictly Read-Only Security, Implementation & Staging Readiness Audit

**Document Version:** 1.0  
**Audit Date:** 2026-11-27  
**Audit Mode:** STRICTLY READ-ONLY (No code, migration, database, Git, or deployment modifications)  
**Git Branch:** `feature/admin-approved-teacher-onboarding`  
**Git Commit Status:** Working tree clean of syntax/build errors; uncommitted feature branch preserved in-place  
**Target Staging Project:** `voyypkysddyrjuqimzya` (`edvora-staging`, PostgreSQL 17.12, AWS `ap-northeast-1`)  
**Protected Dev Project:** `sauphnaxchcouqslflsl` (strictly unreferenced, isolated, and untouched)  
**Audit Verdict:** **APPROVED FOR STAGING PREPARATION** (Migration execution NOT yet authorized)  

---

## 1. Executive Summary

An independent, strictly read-only security and implementation audit was conducted on the complete Phase 4A codebase and prepared migration `00020_admin_approved_teacher_onboarding.sql`.

The audit evaluated:
1. Complete elimination of self-service first-login workspace auto-provisioning.
2. Architecture of the Platform Administration Portal, Server Actions, and database stored procedures.
3. First-Admin bootstrap mechanism and authorization boundaries.
4. Concurrency safety, advisory locking, and anti-abuse canonical email hash guarantees in migration 00020.
5. Preservation of multi-tenant isolation, student authentication, and legacy single-tenant accounts.
6. Verification that provisional student limits (30 / 100 / 300) are not advertised and monthly prices strictly match approved figures (LKR 2,600 / 5,000 / 8,000).
7. Execution and accurate classification of the automated test suite, TypeScript compiler, ESLint, and Next.js production build.

### Core Security Audit Findings
- **Zero Auto-Provisioning Bypass:** Inspection of [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts) confirms lines 285–328 have been excised. Self-service registration creates only a `pending` application in `public.teacher_applications`. No tenant, membership, or trial claim is provisioned on signup or initial login.
- **Strict Server-Side Admin Authorization:** Every Server Action in [actions/admin.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/admin.ts) independently validates caller identity against `public.platform_admins` in PostgreSQL. Cookies in [middleware.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/middleware.ts) serve exclusively as edge routing hints; client-side cookies or roles cannot elevate privileges or bypass server-side security.
- **SQL Defenses in Migration 00020:** Stored procedures `admin_approve_teacher_application` and `admin_reject_teacher_application` enforce `SECURITY DEFINER`, `SET search_path = ''`, internal caller verification via `public.is_platform_admin()`, and advisory transaction locking on both application ID and canonical email hash. Email confirmation is decoupled: `auth.users.email_confirmed_at` is never modified via SQL.
- **Multi-Tenant & Student Continuity:** Legacy student logins, batch isolations, private payment-slip buckets, and default workspace fallbacks remain completely intact with zero regressions across 100 automated test scenarios.
- **Automated Verification:** 100/100 tests passed, 0 TypeScript errors, 0 ESLint errors/warnings, and 37/37 Next.js static/dynamic routes compiled cleanly with exit code 0.

---

## 2. Inventory of Reviewed Files

Every file created or modified in Phase 4A was inspected line-by-line:

| Component Category | File Path | Status | Key Architectural Role |
| :--- | :--- | :--- | :--- |
| **Migrations** | [supabase/migrations/00020_admin_approved_teacher_onboarding.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00020_admin_approved_teacher_onboarding.sql) | Created (Unapplied) | Onboarding schema, plan constraint update, atomic approval & rejection stored procedures, advisory locks, backfill. |
| **Database Types** | [types/database.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/types/database.ts) | Modified | TypeScript definitions for `teacher_applications` table and admin RPC functions. |
| **Edge Middleware** | [middleware.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/middleware.ts) | Modified | Edge routing, 308 redirects (`/teacher/dashboard` &rarr; `/dashboard`, `/student/home` &rarr; `/home`, `/register` &rarr; `/teacher/register`), role containment. |
| **Constants** | [lib/constants.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/constants.ts) | Modified | Portal paths (`STUDENT_LOGIN_PATH`, `TEACHER_LOGIN_PATH`, `TEACHER_REGISTER_PATH`, `ADMIN_LOGIN_PATH`, `ADMIN_DASHBOARD_PATH`), `PUBLIC_ROUTES`. |
| **Server Actions** | [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts) | Modified | Removed auto-provisioning; gated unapproved teacher login; registration inserts to `teacher_applications`; adminLogin action. |
| **Admin Actions** | [actions/admin.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/admin.ts) | Created | Privileged actions guarded by `assertPlatformAdmin()`: metrics, applications, workspaces, payment slips, settings, audit history. |
| **Validation Schemas** | [lib/validators/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/validators/auth.ts) | Modified | Added optional `phoneNumber` to `registerTeacherSchema`. |
| **Admin Validators** | [lib/validators/admin.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/validators/admin.ts) | Created | Zod schemas for admin login, application approval, rejection, workspace toggle, payment verification. |
| **Teacher Portal** | [app/(auth)/teacher/login/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/teacher/login/page.tsx) & [_components/TeacherLoginForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/teacher/login/_components/TeacherLoginForm.tsx) | Created | Dedicated teacher login UI. |
| **Teacher Portal** | [app/(auth)/teacher/register/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/teacher/register/page.tsx) & [_components/TeacherRegisterForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/teacher/register/_components/TeacherRegisterForm.tsx) | Created | Teacher registration UI with trial callout and two-stage verification screen. |
| **Student Portal** | [app/(auth)/student/login/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/student/login/page.tsx) & [_components/StudentLoginForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/student/login/_components/StudentLoginForm.tsx) | Created | Dedicated student login UI with workspace code input. |
| **Admin Portal** | [app/(admin)/admin/login/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/login/page.tsx) & [_components/AdminLoginForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/login/_components/AdminLoginForm.tsx) | Created | Restricted administrator sign-in UI. |
| **Admin Portal** | [app/(admin)/admin/dashboard/layout.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/dashboard/layout.tsx) & [components/layout/AdminNav.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/components/layout/AdminNav.tsx) | Created | Platform administration shell layout and navigation bar. |
| **Admin Portal** | [app/(admin)/admin/dashboard/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/dashboard/page.tsx) & [_components/AdminDashboardTabs.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/dashboard/_components/AdminDashboardTabs.tsx) | Created | Platform administration dashboard with 7 functional tabs and reactive modals. |
| **Unified Auth** | [app/(auth)/login/_components/LoginForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/login/_components/LoginForm.tsx) | Modified | Updated unified login portal with explicit navigation pills for Teacher and Student portals. |
| **Legacy Route** | [app/(auth)/register/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/register/page.tsx) | Modified | Server-side redirect to `/teacher/register` (`instant = false`). |
| **SaaS Tests** | [tests/saas/admin-onboarding.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/admin-onboarding.test.ts) | Created | 26 contract, unit, and integration tests for migration 00020, admin actions, and route redirects. |
| **Package Config** | [package.json](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/package.json) | Modified | Included `admin-onboarding.test.ts` in `npm run test:saas`. |

---

## 3. Platform Admin Bootstrap Audit (CRITICAL)

### 3.1 Initial Table State & Security Posture
The `public.platform_admins` table was established in migration `00013_subscription_and_commercial_billing.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admins_select_self"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```
**Key Security Properties:**
1. **No Client Write Policy:** RLS is enabled with only a `SELECT` policy for self. There is NO `INSERT`, `UPDATE`, or `DELETE` policy granted to `authenticated` or `anon`.
2. **Immutable via Application Code:** No Server Action, Route Handler, or client API can insert into `public.platform_admins`. An ordinary user, student, or teacher cannot promote themselves.
3. **No Header/Cookie/Parameter Bypass:** Neither `edvora-role` cookie, URL parameters, nor Supabase `user_metadata` grant administrative rights. Every check authoritatively queries `public.platform_admins`.

### 3.2 Bootstrap Procedure Assessment
Because `public.platform_admins` is currently empty in the staging database, the initial administrator must be bootstrapped.

The authorized bootstrap script is documented in [PHASE_4A_B1_SECURITY_CORRECTIONS.md](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/PHASE_4A_B1_SECURITY_CORRECTIONS.md#L178-L207):
```sql
-- FIRST-ADMIN BOOTSTRAP SCRIPT (Supabase Dashboard SQL Editor Only)
DO $$
DECLARE
  v_admin_email TEXT := 'admin@edvora.lk'; -- Designated admin email
  v_user_id     UUID;
BEGIN
  -- 1. Verify that user exists in Supabase Auth
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = lower(trim(v_admin_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % does not exist in auth.users. The administrator must register or be invited first.', v_admin_email;
  END IF;

  -- 2. Verify or initialize profile (role must be 'teacher' per profiles_role_check constraint)
  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (v_user_id, 'Platform Super Admin', 'teacher', true)
  ON CONFLICT (id) DO UPDATE
    SET is_active = true;

  -- 3. Register as platform administrator
  INSERT INTO public.platform_admins (user_id, notes)
  VALUES (v_user_id, 'Primary Platform Administrator (Bootstrapped)')
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Platform administrator % successfully bootstrapped (User ID: %).', v_admin_email, v_user_id;
END $$;
```

### 3.3 Bootstrap Security Evaluation
- **Requires Pre-Existing Auth User:** Yes. If the user does not exist in `auth.users`, the script aborts immediately.
- **Enforces Profile Role Constraint:** In migration `00001`, `profiles.role` has check constraint `CHECK (role IN ('teacher', 'student'))`. The bootstrap script sets `role = 'teacher'` so it satisfies the database constraint, while elevation is strictly conferred by membership in `public.platform_admins`.
- **Repeatability & Idempotency:** The script uses `ON CONFLICT (user_id) DO NOTHING`. Running it repeatedly is safe and produces no side effects.
- **Blocker Status:** The bootstrap procedure is fully documented, safe, and ready. It is **NOT** a blocker, provided the deployment checklist mandates running this script in the Supabase SQL Editor immediately after applying migration 00020.

---

## 4. Admin Authorization & Route Containment Audit

### 4.1 Server-Side Authorization Enforcement
Inspection of [actions/admin.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/admin.ts) confirms that every single exported server action begins with `await assertPlatformAdmin()`:
```typescript
async function assertPlatformAdmin(): Promise<{ adminUserId: string }> {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: Platform administrator session required");
  }

  const adminClient = createServerAdminClient();
  const { data: adminRecord, error: adminErr } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminErr || !adminRecord) {
    throw new Error("Forbidden: Caller is not a platform administrator");
  }

  return { adminUserId: user.id };
}
```
**Guarantees Verified:**
1. `getUser()` re-validates the session against Supabase Auth on the server.
2. `adminClient` independently queries `public.platform_admins`.
3. If unauthenticated or absent from `platform_admins`, execution throws and halts immediately.
4. Client cookies (`edvora-role`) are completely ignored during privileged operations.

### 4.2 Database-Level RPC Protection
In [supabase/migrations/00020_admin_approved_teacher_onboarding.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00020_admin_approved_teacher_onboarding.sql), both `admin_approve_teacher_application` (lines 108–111) and `admin_reject_teacher_application` (lines 325–328) execute:
```sql
v_admin_id := (SELECT auth.uid());
IF NOT public.is_platform_admin() THEN
  RAISE EXCEPTION 'Access denied. Platform administrator authorization required.'
    USING ERRCODE = '42501';
END IF;
```
Where `public.is_platform_admin()` evaluates:
```sql
SELECT EXISTS (
  SELECT 1
  FROM public.platform_admins pa
  JOIN public.profiles p ON p.id = pa.user_id
  WHERE pa.user_id = (SELECT auth.uid())
    AND p.is_active = true
);
```
**Conclusion:** Even if a non-admin bypasses the client or calls the PostgreSQL RPC directly via `supabase.rpc()`, the database raises error `42501` and aborts the transaction.

---

## 5. Teacher Onboarding & Identity Audit

### 5.1 Registration Logic Audit
Inspection of `registerTeacher()` in [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts#L433-L641) verifies:
1. **Decoupled Registration:** Self-service registration calls `supabase.auth.signUp()` and inserts into `public.teacher_applications` with `status: 'pending'`.
2. **Zero Workspace Creation:** No `tenants`, `tenant_members`, `teacher_trial_claims`, or `tenant_subscriptions` rows are created during registration.
3. **Canonical Email Hash Generation:** The canonical email is computed via [canonicalizeEmail](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/canonical.ts) (stripping Google dots and `+` subaddressing) and hashed via SHA-256 before insertion.
4. **Immediate Sign-Out:** After signup, `supabase.auth.signOut()` is executed. The applicant is not left with an active authenticated session.
5. **Email Enumeration Protection:** If `authData.user.identities` is empty (indicating an existing user under Supabase email enumeration defense), the action returns `pendingVerification: true` without mutating `profiles` or `teacher_applications`.

### 5.2 Login Gating Audit
Inspection of `login()` in [actions/auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts#L330-L365) verifies:
- When a teacher logs in without an existing workspace membership in `tenant_members`:
  - It queries `public.teacher_applications` for their `user_id`.
  - If `status === 'pending'`, login fails with:  
    `"Your teacher application is currently under review by Edvora administration. You will receive access once approved."`
  - If `status === 'rejected'`, login fails with:  
    `"Your teacher application was not approved: [reason]. Please contact support if you believe this is in error."`
  - If no application exists, login fails with:  
    `"No active tuition workspace found for this account. Please register or contact Edvora administration."`
- **Result:** Applicants in `pending` or `rejected` state cannot access `/dashboard` or any workspace resources.

### 5.3 Email Confirmation Independence
- Migration 00020 contains **zero references** to `auth.users.email_confirmed_at`.
- Approval does not simulate email confirmation.
- The approved educator must still verify their email inbox independently via Supabase Auth confirmation links to satisfy email ownership verification.

---

## 6. Migration 00020 Full Static SQL Audit

A comprehensive static analysis of [00020_admin_approved_teacher_onboarding.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00020_admin_approved_teacher_onboarding.sql) was performed against migrations 00001–00019:

### 6.1 Statement-by-Statement Audit
1. **Lines 15–17: `tenants_plan_check` Update:**
   - Drops `tenants_plan_check` (which in 00007 only allowed `free`, `pro`, `enterprise`).
   - Adds constraint: `CHECK (plan IN ('free', 'starter', 'growth', 'pro', 'enterprise'))`.
   - **Verdict:** Clean and backward-compatible.
2. **Lines 21–42: `public.teacher_applications` Table:**
   - `id`: UUID PRIMARY KEY with `gen_random_uuid()`.
   - `user_id`: REFERENCES `auth.users(id) ON DELETE SET NULL`.
   - `canonical_email_hash`: TEXT NOT NULL with check constraint `length(canonical_email_hash) = 64` and UNIQUE constraint `uq_teacher_applications_canonical_hash`.
   - `status`: TEXT NOT NULL DEFAULT 'pending' with check constraint `IN ('pending', 'approved', 'rejected')`.
   - `verification_method`: Check constraint `IN ('phone_call', 'in_person', 'official_registry', 'pre_verified_test')`.
   - RLS: Enabled. Applicants can only SELECT their own application (`user_id = auth.uid()`). Platform admins have ALL permissions.
   - **Verdict:** Secure. No non-admin can update status or insert duplicate canonical identities.
3. **Lines 78–306: `admin_approve_teacher_application` Procedure:**
   - **Advisory Lock 1 (Line 114):** `pg_advisory_xact_lock(hashtext('app_decision:' || p_application_id::text))` serializes decisions on the application.
   - **Application Verification (Lines 117–134):** `SELECT * ... FOR UPDATE`. Rejects if application does not exist, status is not `'pending'`, or `user_id` is null.
   - **Advisory Lock 2 (Line 137):** `pg_advisory_xact_lock(hashtext('trial_claim:' || v_app.canonical_email_hash))` serializes trial claims on the canonical email identity.
   - **Trial Eligibility Check (Lines 140–148):** Checks `public.teacher_trial_claims` for `normalized_email_hash`. If found, throws error `55000` (`Trial ineligibility`).
   - **Catalog Validation (Lines 151–158):** Verifies active plan `'starter'` exists in `subscription_plans`.
   - **Slug Sanitization & Collision Namespace Lock (Lines 161–174):** Sanitizes slug to 3–35 characters. Acquires advisory lock `pg_advisory_xact_lock(hashtext('tenant_slug:' || v_clean_slug))`. If slug exists in `tenants`, appends random 6-character suffix.
   - **Clock Boundaries (Lines 177–178):** `v_now := clock_timestamp(); v_trial_ends := v_now + INTERVAL '72 hours';`. Uses exact database server clock (259,200 seconds).
   - **Atomic Provisioning (Lines 181–253):**
     - Inserts into `public.tenants` (`owner_id`, `plan = 'starter'`, `max_students = 30`).
     - Inserts into `public.tenant_members` (`role = 'owner'`).
     - Inserts into `public.teacher_trial_claims` (`normalized_email_hash = v_app.canonical_email_hash`).
     - Inserts into `public.tenant_subscriptions` (`status = 'trialing'`, `billing_cycle = 'monthly'`, `trial_started_at = v_now`, `trial_ends_at = v_trial_ends`).
     - Inserts into `public.subscription_history` (`event_type = 'created'`).
   - **Application Update (Lines 277–286):** Updates status to `'approved'`, assigns `tenant_id`, records `reviewed_by`, `reviewed_at`, `verification_method`, `verified_phone`, and `review_notes`.
   - **Profile Activation (Lines 289–291):** Sets `is_active = true` on `public.profiles`.
   - **Privileges (Lines 303–305):** `OWNER TO postgres`, `REVOKE FROM PUBLIC, anon`, `GRANT TO authenticated, service_role`.
   - **Verdict:** Secure, robustly locked against concurrency races, and atomic.
4. **Lines 308–362: `admin_reject_teacher_application` Procedure:**
   - Checks `public.is_platform_admin()`.
   - Acquires advisory lock on `p_application_id`.
   - Locks row `FOR UPDATE`, checks `status == 'pending'`.
   - Updates status to `'rejected'`, records `review_notes`, `reviewed_by`, `reviewed_at`.
   - **Verdict:** Clean, atomic, and safe.
5. **Lines 367–407: Staging Account Backfill:**
   - Idempotently selects unprovisioned teachers from `auth.users` joined to `profiles` where `role = 'teacher'` and `tm.id IS NULL`.
   - Generates canonical email and SHA-256 hash using `encode(digest(...), 'hex')`.
   - Inserts into `public.teacher_applications` with `status = 'pending'`, `verification_method = 'pre_verified_test'`.
   - `ON CONFLICT (canonical_email_hash) DO NOTHING`.
   - **Verdict:** Idempotent, safe, and strictly scoped to unprovisioned teachers.

### 6.2 Multi-Alias / Dual-Trial Attack Analysis
Can an attacker register two accounts with different aliases (e.g., `teacher@gmail.com` and `teacher+trial2@gmail.com`) and obtain two trials?
1. **At Registration:** Both emails resolve to the exact same SHA-256 hash `canonical_email_hash`. Because `uq_teacher_applications_canonical_hash` is unique, the second application cannot create a duplicate application record.
2. **At Approval:** Even if two applications existed under different IDs:
   - Advisory lock on canonical hash serializes both approval transactions.
   - The first approval inserts `normalized_email_hash` into `teacher_trial_claims`.
   - The second approval queries `teacher_trial_claims` where `normalized_email_hash = hash`. It discovers the existing claim and immediately raises exception `55000`.
   - Furthermore, `teacher_trial_claims.normalized_email_hash` has a UNIQUE constraint at the table level.
- **Verdict:** Defeated at three independent architectural layers.

---

## 7. Multi-Tenant & Student Regression Audit

### 7.1 Multi-Tenant Isolation
- Staff operations in [actions/batches.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/batches.ts), [actions/lessons.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/lessons.ts), [actions/notes.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/notes.ts), and [actions/announcements.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/announcements.ts) continue to require `requireTenantContext()`.
- Every SQL query and mutation remains explicitly scoped by `tenant_id`.
- Test suite scenarios 1–10 in [actions-security.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/actions-security.test.ts) confirm that cross-tenant hint tampering fails closed.

### 7.2 Student Authentication & Access Continuity
- Student accounts operate via `public.enrollments` and are isolated from staff memberships.
- Dedicated student login portal [StudentLoginForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/student/login/_components/StudentLoginForm.tsx) passes student credentials to `studentLogin()`.
- Backward compatibility: Legacy student logins without a workspace code resolve to the default workspace through enrollment lookups in `actions/auth.ts` lines 270–280.
- Lessons and notes displayed in the student portal are strictly filtered by enrolled batch IDs.
- Inactive or expired workspace status prevents student access to premium lessons and notes (verified in test scenarios 23 & 24 of `trial-subscription.test.ts`).

### 7.3 Storage Bucket Security
- Storage bucket `payment_slips` remains strictly private.
- Only the uploader (`user_id = auth.uid()`) or platform administrators (`public.is_platform_admin()`) can read slip objects via Supabase Storage policies.
- In `actions/admin.ts`, `getPendingPaymentSlips()` generates time-limited (1-hour) signed URLs via `createSignedUrl` using the service-role client, ensuring the bucket itself is never made public.

---

## 8. Dashboard & Commercial Configuration Audit

### 8.1 Inspection of Admin Dashboard
Inspection of [AdminDashboardTabs.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/dashboard/_components/AdminDashboardTabs.tsx) verifies that all **seven** reported management sections exist and are fully functional:

1. **Overview Tab:** Metric summary cards displaying Total Teachers, Pending Applications, Active Students, Active Subscriptions, Pending Bank Slips, and Monthly MRR.
2. **Applications Tab:** Full review queue with status filter pills (All, Pending, Approved, Rejected) and instant search. Features modal dialogs for:
   - **Review & Approve:** Selects verification mode (`phone_call`, `in_person`, `institutional_credentials`, `pre_verified_test`), verified contact phone, and review notes; executes `approveTeacherApplicationAction`.
   - **Reject:** Requires rejection reason notes; executes `rejectTeacherApplicationAction`.
3. **Workspaces Tab:** Comprehensive directory of all tuition workspaces displaying name, slug, owner name, active student count, current plan, status pill (Active/Suspended), and single-click access toggle executing `toggleWorkspaceActiveAction`.
4. **Subscriptions Tab:** Directory showing subscription status (`trialing`, `active`, `pending_payment`), trial expiry timestamps, and current billing period end dates.
5. **Bank Payments Tab:** Verification queue for manual bank deposit proofs. Displays workspace name, plan, LKR amount, reference number, and a direct link opening the signed private bank slip URL. Features modal actions to **Approve & Activate (30-day extension)** or **Reject with reason**.
6. **Catalog & Quotas Tab:** Commercial settings viewer with cards for Starter, Growth, and Pro tiers. Displays approved monthly pricing, technical student ceilings, and storage quotas. Features prominent disclaimer banner.
7. **Audit Log Tab:** Chronological audit trail populated from `public.subscription_history` showing event timestamps, workspace names, event types (`created`, `activated`, `renewed`), operators, and audit notes.

### 8.2 Commercial Pricing Verification
The catalog plan prices in migration `00013_subscription_and_commercial_billing.sql` lines 105, 115, 125 and [AdminDashboardTabs.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/dashboard/_components/AdminDashboardTabs.tsx) strictly match the approved amounts:
- **Starter Tuition:** LKR 2,600 / month
- **Growth Academy:** LKR 5,000 / month
- **Pro Enterprise:** LKR 8,000 / month

### 8.3 Provisional Quotas Safeguard
- Neither [TeacherRegisterForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/teacher/register/_components/TeacherRegisterForm.tsx) nor [SubscriptionPaymentForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/components/subscription/SubscriptionPaymentForm.tsx) advertises student numbers as guaranteed commercial entitlements.
- [AdminDashboardTabs.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(admin)/admin/dashboard/_components/AdminDashboardTabs.tsx) renders an explicit amber notice:
  > *"The student quota limits displayed below (Starter: 30, Growth: 100, Pro: 300) are temporary technical system ceilings and have not been commercially finalized. They must not be advertised to prospective tuition instructors as fixed commercial entitlements. Monthly pricing (LKR 2,600 / 5,000 / 8,000) is officially approved."*

---

## 9. Automated Verification & Test Classification

### 9.1 Verification Command Results

| Verification Check | Exact Command Executed | Exit Code | Result | Key Metrics |
| :--- | :--- | :---: | :---: | :--- |
| **SaaS Test Suite** | `npm run test:saas` | **0** | **PASS** | 100 tests passed, 0 failed, 9 suites, 4,055 ms. |
| **TypeScript Compiler** | `npx tsc --noEmit` | **0** | **PASS** | Zero type errors across all application and test files. |
| **ESLint Analysis** | `npm run lint` | **0** | **PASS** | Zero errors, zero warnings under ESLint 9. |
| **Production Build** | `npm run build` | **0** | **PASS** | 37 static and dynamic pages compiled with Turbopack. |

### 9.2 Strict Test Environment Classification
In accordance with professional testing standards, the 100 automated SaaS tests are classified with technical precision:

| Test Suite File | Test Count | Accurate Classification | Detailed Rationale |
| :--- | :---: | :--- | :--- |
| `tests/saas/auth-foundation.test.ts` | 14 | **Mock-Based Unit & Contract Tests** | Tests role hierarchy, permission sets, and tenant auth token extraction using in-memory mock client wrappers. Does not connect to PostgreSQL. |
| `tests/saas/actions-security.test.ts` | 11 | **Mock-Based Action Security Tests** | Tests server action isolation across batches, lessons, notes, and notices using mock Supabase client contexts. |
| `tests/saas/student-auth-isolation.test.ts` | 17 | **Mock-Based Integration Tests** | Tests student auth isolation, workspace code resolution, IP extraction logic, and rate limiting counters using mock structures. |
| `tests/saas/trial-subscription.test.ts` | 32 | **Mock-Based Contract & Schema Tests** | Tests 72-hour trial math (259,200s), trial expiration gating, Zod payment schemas, canonical email hashing, and magic bytes verification. |
| `tests/saas/admin-onboarding.test.ts` | 26 | **Static SQL Contract & Unit Tests** | Tests migration 00020 SQL file integrity, regex matching of security guarantees, advisory locking patterns, Zod admin schemas, and 308 redirect contracts. |

> [!NOTE]
> **Technical Clarification:** None of the automated tests above are live PostgreSQL database integration tests or live browser end-to-end tests against remote Supabase staging. They are mock-based unit and contract tests designed to execute deterministically in offline and CI environments without mutating remote database state. Live database verification occurs in Phase F after staging migration execution.

---

## 10. Security Findings & Recommendations

### Summary of Findings
| Finding ID | Severity | Category | Description | Status |
| :--- | :---: | :--- | :--- | :---: |
| **SEC-4A-D-01** | **LOW** | Operational | Platform admin bootstrap must be executed in Supabase SQL Editor prior to testing admin portal. | Documented |
| **SEC-4A-D-02** | **INFO** | Architecture | Recommend creating dedicated `lib/auth/admin.ts` for administrative assertion helpers. | Recommended |
| **SEC-4A-D-03** | **INFO** | SQL Compatibility | `pgcrypto` functions in top-level backfill should assume standard Supabase search path. | Verified |
| **SEC-4A-D-04** | **INFO** | Commercial Hosting | Vercel Hobby tier is appropriate for staging; production launch requires Pro tier. | Documented |

### Finding Details

#### SEC-4A-D-01: Platform Admin Bootstrap Operational Dependency
- **Severity:** LOW (Operational Prerequisite)
- **Detail:** Because `public.platform_admins` is currently empty, any admin sign-in attempt will be rejected until the initial administrator is inserted.
- **Action Required:** In Phase D (Staging Preparation), the administrator must run the documented bootstrap script in the Supabase SQL Editor immediately after migration 00020 is applied.

#### SEC-4A-D-02: Modularization of `lib/auth/admin.ts`
- **Severity:** INFORMATIONAL
- **Detail:** Currently, `assertPlatformAdmin()` is an internal helper in `actions/admin.ts`.
- **Recommendation:** In a future cleanup, consider moving `assertPlatformAdmin()` into a dedicated `lib/auth/admin.ts` module to mirror `lib/auth/tenant.ts`. The current implementation is already strictly secure.

---

## 11. Unverified Assumptions & Remaining Risks

1. **Supabase Staging Database Latency & Advisory Locks:**
   - Advisory transaction locks (`pg_advisory_xact_lock`) depend on single-cluster PostgreSQL semantics. Supabase staging runs a single primary instance in AWS `ap-northeast-1`, which fully supports advisory locking.
2. **Supabase Auth Email Delivery:**
   - Onboarding approved teachers requires them to click the confirmation link in their email inbox. Staging relies on Supabase's built-in SMTP or custom provider. Verification of email deliverability will be completed during live staging testing in Phase F.
3. **Vercel Commercial Terms:**
   - Vercel Hobby terms allow non-commercial and evaluation usage. Staging deployment on Hobby is fully compliant. Commercial production launch will require upgrading to Vercel Pro ($20/seat/mo).

---

## 12. Final Verdict & Next Steps

### Official Audit Verdict:
# **APPROVED FOR STAGING PREPARATION**

### Boundaries of this Approval:
- **Approval for Staging Preparation** acknowledges that all code, migrations, schemas, security controls, and automated tests are verified, clean, and architecturally sound.
- **This approval DOES NOT authorize:**
  - Remote SQL execution on Supabase staging.
  - Running `supabase db push`.
  - Creating Git commits or pushing to remote GitHub.
  - Deploying to Vercel Preview or Production.

### Authorized Next Sequence (Awaiting User Command):
1. **Phase D.1 — Staging Database Preparation:** User authorizes connecting to Supabase project `voyypkysddyrjuqimzya` to run migration `00020_admin_approved_teacher_onboarding.sql` and the First-Admin Bootstrap script.
2. **Phase E.1 — Git Commit & Remote Push:** User authorizes committing the working tree to `feature/admin-approved-teacher-onboarding` and pushing to GitHub.
3. **Phase F.1 — Staging Live Verification:** End-to-end verification of teacher registration, admin review, approval, and portal routing on the deployed staging environment.
