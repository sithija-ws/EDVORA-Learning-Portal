# EDVORA — PHASE 3C.3: COMPLETE STAGING MIGRATION PREFLIGHT AUDIT REPORT

**Audit Date:** 2026-11-25  
**Target Environment:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`)  
**Protected Environment:** Development (`sauphnaxchcouqslflsl`) — Untouched  
**Audit Scope:** Migrations `00001_create_tables.sql` through `00019_rpc_security_and_storage_hardening.sql`  
**Mode:** Strictly Read-Only (0 SQL executions, 0 file mutations, 0 git commits)  

---

## 1. Executive Summary & Verdict

### Final Verdict: **CORRECTIONS REQUIRED**

Before executing migrations on the staging database, **two critical defects** must be remediated:
1. **[CRITICAL] Migration 00004 Syntax Crash:** `supabase/migrations/00004_seed_teacher.sql` contains a non-UUID string literal `'<TEACHER_AUTH_UUID>'` assigned to a variable of type `UUID`. PostgreSQL will throw a fatal `invalid input syntax for type uuid` error, completely halting migration application at migration 00004.
2. **[CRITICAL] Migration 00018 & 00019 Runtime Column Mismatch:** Stored procedure `public.provision_tenant_workspace()` attempts to insert into non-existent column `joined_at` on table `public.tenant_members`. When a teacher attempts first login after email verification, workspace provisioning will crash and roll back.

Once these two corrections are prepared, the remaining 17 migrations demonstrate exemplary PostgreSQL security architecture, strict RLS tenant isolation, ACID concurrency locking, and fail-closed rate limiting.

---

## 2. Detailed Findings Register

### FINDING-3C3-CRIT-01: Migration 00004 Non-UUID Placeholder Causes Fatal Execution Failure
- **Severity:** CRITICAL
- **File & Location:** `supabase/migrations/00004_seed_teacher.sql` (Line 28)
- **Defective SQL:**
  ```sql
  DO $$
  DECLARE
    v_teacher_id  UUID := '<TEACHER_AUTH_UUID>';   -- paste UUID from Auth dashboard
    v_full_name   TEXT := 'Teacher Name';          -- replace with actual name
  BEGIN
    INSERT INTO public.profiles (id, full_name, role, batch_id, is_active)
    VALUES (v_teacher_id, v_full_name, 'teacher', NULL, true)
  ...
  ```
- **Explanation:** `00004_seed_teacher.sql` was authored as a manual interactive SQL script for single-teacher MVP development. Because it was committed with the placeholder `<TEACHER_AUTH_UUID>`, any automated migration runner (`supabase db push` or `migration up`) will evaluate `v_teacher_id UUID := '<TEACHER_AUTH_UUID>';`. PostgreSQL immediately throws:
  `ERROR: invalid input syntax for type uuid: "<TEACHER_AUTH_UUID>"` (SQLSTATE `22P02`).
  This aborts the entire migration pipeline on clean staging.
- **Recommended Correction:** Wrap the insert in a UUID validation check or convert 00004 into an idempotent no-op when the placeholder is present:
  ```sql
  DO $$
  DECLARE
    v_teacher_raw TEXT := '<TEACHER_AUTH_UUID>';
    v_teacher_id  UUID;
  BEGIN
    -- Only execute if a genuine UUID was supplied
    IF v_teacher_raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      v_teacher_id := v_teacher_raw::UUID;
      INSERT INTO public.profiles (id, full_name, role, batch_id, is_active)
      VALUES (v_teacher_id, 'Teacher Name', 'teacher', NULL, true)
      ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
    ELSE
      RAISE NOTICE 'Migration 00004: Placeholder UUID detected. Skipping legacy teacher seed for dynamic SaaS registration.';
    END IF;
  END $$;
  ```

---

### FINDING-3C3-CRIT-02: `provision_tenant_workspace()` References Non-Existent Column `joined_at`
- **Severity:** CRITICAL
- **File & Location:** 
  - `supabase/migrations/00018_atomic_workspace_provisioning_and_storage.sql` (Line 214)
  - `supabase/migrations/00019_rpc_security_and_storage_hardening.sql` (Line 183)
- **Defective SQL:**
  ```sql
  -- 10. Assign Owner Membership
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    role,
    joined_at
  ) VALUES (
    v_tenant_id,
    p_user_id,
    'owner',
    v_now
  );
  ```
- **Explanation:** In `00007_create_tenant_infrastructure.sql` (lines 37–47), table `public.tenant_members` was created with the following schema:
  - `id` (UUID PRIMARY KEY)
  - `tenant_id` (UUID REFERENCES public.tenants)
  - `user_id` (UUID REFERENCES public.profiles)
  - `role` (TEXT CHECK (...))
  - `created_at` (TIMESTAMPTZ DEFAULT now())
  - `updated_at` (TIMESTAMPTZ DEFAULT now())
  There is **no column named `joined_at`**.
  While the DDL statement `CREATE OR REPLACE FUNCTION` will compile without error in PostgreSQL (because PL/pgSQL does not check relation attributes of dynamic or body DML until execution), the RPC will **immediately crash at runtime** when called by `actions/auth.ts`:
  `ERROR: column "joined_at" of relation "tenant_members" does not exist` (SQLSTATE `42703`).
  This completely blocks any registered teacher from provisioning a workspace upon email confirmation.
- **Recommended Correction:** Change `joined_at` to `created_at` in lines 183 & 188 of migration 00019 (and migration 00018):
  ```sql
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    role,
    created_at
  ) VALUES (
    v_tenant_id,
    p_user_id,
    'owner',
    v_now
  );
  ```

---

### FINDING-3C3-MED-01: Migration 00009 Unconditional `NOT NULL` on `tenant_id` Assumes Prior Backfill
- **Severity:** MEDIUM
- **File & Location:** `supabase/migrations/00009_tenant_scoping_and_composite_integrity.sql` (Lines 69–76)
- **Explanation:** Migration 00008 skips creating `default-workspace` if `v_teacher_count = 0`. In migration 00009, `tenant_id` columns are backfilled from `default-workspace`. Lines 69–76 then execute `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL;`. On a clean staging database, this succeeds because all tables are empty (0 rows). However, on any database containing un-scoped rows where 00008 was skipped, this would throw a `not_null_violation`.
- **Recommended Correction:** Document that clean staging execution is safe, but any environment with pre-existing unparented batches must run 00008 with an active teacher before 00009.

---

### FINDING-3C3-LOW-01: Missing Initial Seed for Platform Super-Administrators
- **Severity:** LOW
- **File & Location:** `supabase/migrations/00013_subscription_and_commercial_billing.sql` (Lines 13–28)
- **Explanation:** Table `public.platform_admins` is created with RLS enabled, but starts with 0 rows. Without at least one registered platform super-admin, testing the manual bank transfer payment approval workflow (`actions/subscriptions.ts` -> `admin_verify_subscription_payment()`) in staging will return `Access denied. Platform administrator credentials required.`.
- **Recommended Correction:** Prepare a post-migration staging seed script to insert the authorized tester's Auth UUID into `public.platform_admins`.

---

### FINDING-3C3-INFO-01: Provisional Student & Storage Limits in Subscription Catalog
- **Severity:** INFO
- **File & Location:** `supabase/migrations/00013_subscription_and_commercial_billing.sql` (Lines 98–130)
- **Explanation:** The initial seed rows in `public.subscription_plans` define provisional quotas:
  - Starter: 30 students, 2 GB storage (LKR 2,600/mo)
  - Growth: 100 students, 10 GB storage (LKR 5,000/mo)
  - Pro: 300 students, 50 GB storage (LKR 8,000/mo)
  These are non-finalized operational placeholders. The database architecture correctly supports administrative overrides via `custom_student_limit` and `custom_storage_limit_bytes` on `public.tenant_subscriptions` without requiring schema migrations.

---

## 3. Migration Sequence & Dependency Matrix

| Migration | Target Objects | Dependencies | Status | Safety Evaluation |
| :--- | :--- | :--- | :---: | :--- |
| `00001_create_tables.sql` | `batches`, `profiles`, `lessons`, `announcements`, junction tables | `pgcrypto`, `auth.users` | **PASS** | Clean initial DDL. Foreign keys to `auth.users`. |
| `00002_enable_rls.sql` | RLS on 6 tables | `00001` | **PASS** | Default-deny posture established. |
| `00003_rls_policies.sql` | Single-teacher helper functions & policies | `00001`, `00002` | **PASS** | Legacy policies (safely superseded in 00005 & 00011). |
| `00004_seed_teacher.sql` | Seed teacher `profiles` | `00001` | **FAIL (CRIT-01)** | `<TEACHER_AUTH_UUID>` causes fatal cast error. |
| `00005_enrollments_many_to_many.sql` | `enrollments`, student helper functions | `00001`–`00003` | **PASS** | Hardened `SECURITY DEFINER` functions (`SET search_path = ''`). |
| `00006_notes_feature.sql` | `notes`, `note_batches`, bucket `notes` | `00001`, `storage.buckets` | **PASS** | Clean table & bucket creation. |
| `00007_create_tenant_infrastructure.sql` | `tenants`, `tenant_members`, `student_identities` | `00001` | **PASS** | Core multi-tenant tables, member safety trigger. |
| `00008_backfill_default_tenant.sql` | Legacy workspace backfill | `00007` | **PASS** | Handles 0 teachers gracefully (`RETURN`). |
| `00009_tenant_scoping_and_composite_integrity.sql` | `tenant_id` columns, composite FKs | `00007`, `00008` | **PASS** | Enforces composite integrity `(id, tenant_id)`. |
| `00010_tenant_auth_functions.sql` | Tenant authorization & workspace RPCs | `00007`, `00009` | **PASS** | Role hierarchy evaluation, safe search paths. |
| `00011_multi_tenant_rls_policies.sql` | Granular multi-tenant RLS | `00009`, `00010` | **PASS** | Full tenant isolation, drops legacy policies. |
| `00012_storage_tenant_policies.sql` | Bucket `notes` multi-tenant RLS | `00006`, `00010` | **PASS** | Makes bucket private; isolates `{tenant_id}/*`. |
| `00013_subscription_and_commercial_billing.sql` | Billing plans, subscriptions, payments | `00007` | **PASS** | Approved commercial pricing (LKR 2600, 5000, 8000). |
| `00014_subscription_enforcement_and_rls.sql` | Quota & mutation triggers | `00013` | **PASS** | Serialized row-level locking (`FOR UPDATE OF ts`). |
| `00015_student_workspace_active_status.sql` | `student_identities.is_active` | `00007`, `00010` | **PASS** | Workspace-scoped student suspension. |
| `00016_auth_rate_limiting.sql` | `auth_rate_limits` & atomic RPCs | Independent | **PASS** | Distributed brute-force defense; service_role only. |
| `00017_trial_and_teacher_registration.sql` | 72-hr trial, `teacher_trial_claims` | `00013`, `00014` | **PASS** | Enforces trial timestamps with `clock_timestamp()`. |
| `00018_atomic_workspace_provisioning_and_storage.sql` | Bucket `payment_slips`, provisioning RPC | `00013`, `00017` | **FAIL (CRIT-02)** | Line 214 references non-existent `joined_at`. |
| `00019_rpc_security_and_storage_hardening.sql` | Storage limit, advisory lock, RPC revamp | `00018` | **FAIL (CRIT-02)** | Line 183 references non-existent `joined_at`. |

---

## 4. Row Level Security & Tenant Isolation Audit

1. **Cross-Tenant Access Prevention:**
   - Every tenant-owned table (`batches`, `lessons`, `notes`, `announcements`, `enrollments`, `lesson_batches`, `note_batches`, `announcement_batches`) is guarded by explicit RLS policies requiring `public.has_tenant_role(tenant_id, ...)` or `public.is_enrolled_in_tenant_batch(...)`.
   - Direct cross-tenant linking is strictly blocked at the relational engine level via composite foreign keys `(id, tenant_id)`.
2. **Staff Role Separation:**
   - Permissions follow strict hierarchy: `owner (40) > admin (30) > instructor (20) > assistant (10)`.
   - Assistants can create/update announcements, but cannot delete them or mutate lessons/batches.
   - Instructors can create/manage lessons, batches, and notes, but cannot manage members, student accounts, or workspace settings.
   - Admins can manage student identities, enrollments, and batch deletions.
   - Owners retain exclusive authority over billing, workspace deletion, and ownership transfer.
3. **Student Isolation:**
   - Students have zero access to staff administration endpoints.
   - Students can only read batches, lessons, notes, and announcements strictly assigned to their enrolled batch in an active tenant where their `student_identities.is_active` is `true`.
4. **Function Execution & Search Path:**
   - All 21 `SECURITY DEFINER` functions across migrations `00005` to `00019` explicitly enforce `SET search_path = ''` and schema-qualify all referenced tables (`public.*`, `auth.*`, `storage.*`).
   - Public and anonymous execution privileges are revoked.
   - Administrative functions (`provision_tenant_workspace`, rate-limiting RPCs) are strictly granted to `service_role` only.
5. **Storage Bucket Isolation:**
   - Both `notes` (migration 00012) and `payment_slips` (migration 00018/00019) are configured with `public = false`. Direct unauthenticated CDN downloads are completely disabled.
   - File paths are strictly enforced to begin with `{tenant_id}/*`.
   - Payment slips are restricted to workspace admins and platform admins only.

---

## 5. Subscription Lifecycle & Abuse Defense Audit

1. **72-Hour Trial Lifecycle:**
   - Introductory trial commences at `clock_timestamp()` upon workspace provisioning and terminates at `v_now + interval '72 hours'`.
   - `is_tenant_subscription_active()` evaluates status `'trialing'` against `trial_ends_at > clock_timestamp()`.
   - Once expired, database triggers (`trg_sub_active_*`) immediately block content creation and student enrollments.
2. **Trial Abuse Prevention:**
   - Normalized SHA-256 email hashes are stored in `public.teacher_trial_claims` with a `UNIQUE` constraint.
   - Subsequent registrations using canonical aliases (e.g. `john.doe+test@gmail.com` vs `johndoe@gmail.com`) resolve to the same hash.
   - Duplicate registrations are provisioned atomically with status `'expired'`, preventing repeat trial issuance.
3. **Concurrency & Race Conditions:**
   - `provision_tenant_workspace()` acquires a transaction-level advisory lock `pg_advisory_xact_lock(hashtext(p_user_id::text))` to serialize concurrent provisioning requests.
   - `enforce_tenant_student_quota()` acquires an exclusive row lock (`FOR UPDATE OF ts`) on `public.tenant_subscriptions` during enrollments, eliminating TOCTOU quota bypasses.
   - `admin_verify_subscription_payment()` locks target payment and subscription rows in strict sequential order, eliminating deadlock risks.

---

## 6. Application Compatibility Check

| Feature Area | Application Implementation | Migration Schema | Compatibility Status |
| :--- | :--- | :--- | :---: |
| **Teacher Registration** | `actions/auth.ts:registerTeacher()` | `auth.users`, `public.profiles` | **COMPATIBLE** |
| **Workspace Provisioning** | `actions/auth.ts:provisionTenantWorkspaceAction()` | `public.provision_tenant_workspace()` | **BROKEN (CRIT-02)** (`joined_at`) |
| **Student Login** | `actions/auth.ts:loginStudentAction()` | `public.student_identities` | **COMPATIBLE** |
| **Rate Limiting** | `lib/auth/rate-limit.ts` | `public.auth_rate_limits` | **COMPATIBLE** |
| **Batch Management** | `actions/batches.ts` | `public.batches` (tenant-scoped) | **COMPATIBLE** |
| **Lesson Management** | `actions/lessons.ts` | `public.lessons`, `public.lesson_batches` | **COMPATIBLE** |
| **Notes & PDF Storage** | `actions/notes.ts` | `public.notes`, private bucket `notes` | **COMPATIBLE** (Signed URLs supported) |
| **Manual Bank Payments** | `actions/subscriptions.ts` | `public.subscription_payments`, bucket `payment_slips` | **COMPATIBLE** |
| **Payment Verification** | `actions/subscriptions.ts` | `public.admin_verify_subscription_payment()` | **COMPATIBLE** (Row locked) |

---

## 7. Staging Prerequisites Checklist

Before executing migrations on `edvora-staging` (`voyypkysddyrjuqimzya`):

1. **Supabase Auth Dashboard Configuration:**
   - Navigate to *Authentication -> Providers -> Email*:
     - **Enable Email Provider:** `ON`
     - **Confirm Email:** `ON` (Crucial: required by `provision_tenant_workspace()`).
   - Configure Redirect URLs: Add `http://localhost:3000/**` and any Vercel staging preview URL.
2. **Zero-Budget Email Verification Strategy:**
   - Under Supabase Free tier, built-in email sends are limited to 3 emails per hour.
   - For staging testing:
     - Utilize developer-generated signup links via Supabase Dashboard (*Authentication -> Users -> Invite / Send magic link*) OR configure a free custom SMTP provider (e.g. Resend free 100/day tier) in Supabase Auth settings to avoid the 3/hour limit at $0 cost.
3. **Remediation of Findings CRIT-01 and CRIT-02:**
   - Correct `supabase/migrations/00004_seed_teacher.sql` to avoid casting `<TEACHER_AUTH_UUID>` to UUID.
   - Correct `supabase/migrations/00018_...` and `00019_...` to replace `joined_at` with `created_at`.
4. **Environment Secrets Setup (`.env.staging`):**
   - Confirm `.env.staging` contains the active `edvora-staging` project reference, anon key, and service role key.
   - Confirm `.env.staging` remains untracked in `.gitignore`.
5. **Platform Admin Seeding:**
   - Create a test platform super-admin in Auth and insert their ID into `public.platform_admins` for payment approval testing.
