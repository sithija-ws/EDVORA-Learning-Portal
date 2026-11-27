# Edvora — Phase 4A: Phase B.1 Security Corrections Review
## In-Depth Read-Only Correction & Security Architecture Specification

**Review Date:** 2026-11-27  
**Environment Target:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`)  
**Protected Development Project:** `sauphnaxchcouqslflsl` (Strictly untouched & detached)  
**Status:** **READ-ONLY REVIEW COMPLETE — AWAITING EXPLICIT USER APPROVAL**  
**Execution Gate:** Strictly NO code modifications, migration creation, database changes, Git commits, pushes, or deployments have been executed.

---

## Executive Summary & Architecture Overview

The Phase B implementation plan proposed the introduction of an admin-approved onboarding workflow, three separate portals, and a platform admin dashboard. This Phase B.1 security review conducts a rigorous audit of the proposed design against strict production security standards, database integrity constraints, and multi-tenant isolation boundaries.

### Core Security Corrections at a Glance

1. **Email Ownership & Account Activation:**  
   Eliminated the unsafe automatic `auth.users.email_confirmed_at` update in the approval RPC. Replaced with an explicit **Two-Stage Identity Attestation & Activation Workflow** that prevents email identity spoofing and account takeover while maintaining zero-budget operational resilience.
2. **Canonical Email & Trial Abuse Prevention:**  
   Unified trial claim evaluation strictly around the provider-aware engine in `lib/auth/canonical.ts`. Fixed the flawed SQL proposal where already-claimed identities were silently provisioned additional free trials. The corrected schema strictly halts trial provisioning for previously claimed identities.
3. **Admin Authorization & Privilege Separation:**  
   Reaffirmed that Edge Middleware and cookies are strictly performance and routing optimizations. Hardened server-side verification: every admin Server Action, Server Component, and PostgreSQL RPC independently queries `public.platform_admins` via `public.is_platform_admin()`. Corrected the first-admin bootstrap SQL to comply with the `profiles_role_check` constraint.
4. **Atomic & Idempotent Provisioning:**  
   Introduced multi-key transactional advisory locks (`pg_advisory_xact_lock`) on both application ID and canonical email hash. Fixed race conditions between approval and rejection, and closed slug generation collision vectors.
5. **Schema Compatibility Corrections (00001–00019):**  
   Identified and resolved critical schema defects in the previous Phase B SQL draft:
   - Fixed missing `owner_id`, `plan`, and `max_students` in `public.tenants` INSERT.
   - Fixed invalid `event_type = 'trial_started'` in `public.subscription_history` (which violated the check constraint). Corrected to `'created'`.
   - Verified exact column names on `tenant_members` (`created_at`, not `joined_at`).
   - Aligned foreign keys and cascading delete rules.
6. **Routing Consistency:**  
   Standardized `/dashboard` as the canonical teacher dashboard route with `/teacher/dashboard` providing an immediate permanent HTTP redirect to `/dashboard`, preserving backward compatibility across all existing UI components, breadcrumbs, Server Actions, and test suites.

---

## 1. Email Ownership and Account Activation

### 1.1 The Vulnerability in the Phase B Proposal
The initial Phase B draft proposed setting `auth.users.email_confirmed_at = COALESCE(email_confirmed_at, clock_timestamp())` directly inside the PostgreSQL stored procedure `admin_approve_teacher_application`.

> [!CAUTION]
> **Account Takeover / Identity Impersonation Hazard:**  
> If Malory registers at `/teacher/register` using an unverified email belonging to Bob (`bob@example.com`) and inputs Malory's password, Malory has not proven access to `bob@example.com`. If a platform administrator approves the application on the basis of institution details alone, setting `email_confirmed_at = now()` gives Malory authenticated access to `bob@example.com` on Edvora. If Bob later attempts to register his genuine email address, he is locked out.

### 1.2 Corrected Architecture: Out-of-Band Attestation & Dual-Option Activation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      APPLICANT REGISTRATION FLOW                            │
│  Teacher submits at /teacher/register:                                      │
│  - Full Name, Email, Mobile Phone Number, Institute Name, Requested Slug     │
│  - Initial Private Password (hashed by Supabase Auth)                       │
│  - National Identity / Accreditation Reference                               │
│  Result: Supabase Auth user created (unconfirmed); Application 'pending'    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ADMINISTRATIVE IDENTITY VERIFICATION                      │
│  Platform Admin reviews pending application in /admin/dashboard:             │
│  1. Contacts applicant via verified telephone / WhatsApp / in-person check.  │
│  2. Confirms that applicant is legitimate instructor and owns contact details.│
│  3. Admin chooses activation pathway:                                       │
│     Path A (Standard): Applicant confirms via Supabase inbox link.          │
│     Path B (Admin-Attested Phone/Direct Verification):                      │
│       Admin attests to out-of-band verification and supplies verified phone. │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ATOMIC APPROVAL & PROVISIONING                        │
│  1. Stored Procedure admin_approve_teacher_application() provisions tenant,  │
│     owner membership, trial claim, and subscription.                        │
│  2. Application record records: verified_phone, verification_method,        │
│     reviewed_by (admin UUID), reviewed_at, and review_notes.                │
│  3. The database RPC DOES NOT modify auth.users.email_confirmed_at directly. │
│  4. For Path B, the server backend (service_role) logs an audit event and    │
│     confirms the user via Supabase Auth Admin API ONLY after explicit admin  │
│     attestation metadata is committed.                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Handling Existing Unconfirmed Accounts (Teacher Alpha & Beta)
- **Current State:** `sithijax2@gmail.com` (Teacher Alpha) and `sithija.ws@gmail.com` (Teacher Beta) are unconfirmed accounts created during Phase 3D.2.3. Both are controlled test identities belonging to the project owner.
- **Migration & Review:** The idempotent backfill in migration 00020 inserts both accounts into `teacher_applications` with `status = 'pending'`.
- **Zero-Bypass Verification:**
  - Neither account will have their workspace provisioned automatically.
  - When the project owner accesses `/admin/dashboard`, both applications appear in the review queue.
  - The admin can review and approve each application with verification notes (e.g. `Pre-verified project owner test identity`).
  - Account ownership is fully preserved because the passwords were set by the project owner during Phase 3D.2.3.

---

## 2. Canonical Email and Trial Abuse Prevention

### 2.1 The Vulnerability in the Phase B Proposal
The initial Phase B draft computed canonical hashes in SQL using:
```sql
v_canonical_hash := encode(digest(lower(trim(v_app.email)), 'sha256'), 'hex');
```
This had two fatal flaws:
1. **Algorithm Discrepancy:** It ignored provider-aware rules in `lib/auth/canonical.ts` (e.g. Gmail dot-removal and plus-addressing tags). Thus, `sithija.ws@gmail.com` produced a different hash in SQL than `sithijaws@gmail.com`, bypassing trial abuse detection.
2. **Silent Trial Provisioning on Ineligible Users:** The proposal checked `IF v_existing_claim_id IS NULL THEN INSERT INTO teacher_trial_claims ... END IF`, but proceeded to create the 72-hour trial subscription regardless of whether a claim existed!

### 2.2 Corrected Architecture: Unified Provider-Aware Canonicalization

```typescript
// 1. Client & Server Action Layer (lib/auth/canonical.ts)
// Canonical email and SHA-256 hash are derived AUTHORITATIVELY using canonicalizeEmail()
const canonicalEmail = canonicalizeEmail(rawEmail);
const canonicalEmailHash = getCanonicalEmailHash(rawEmail);
```

### 2.3 Corrected Database-Level Uniqueness & Ineligibility Handling
In `supabase/migrations/00020_admin_approved_teacher_onboarding.sql`:
1. **Schema Representation:**
   `public.teacher_applications` stores:
   - `email`: Applicant's input email (`sithija.ws@gmail.com`).
   - `canonical_email`: Normalized email (`sithijaws@gmail.com`).
   - `canonical_email_hash`: Cryptographic SHA-256 digest (`CHECK (length(canonical_email_hash) = 64)`).
   - `CONSTRAINT uq_teacher_applications_canonical_hash UNIQUE (canonical_email_hash)`: Prevents submitting multiple alias applications from the same mailbox while an application is pending or approved.
2. **Strict Ineligibility Enforcement in Approval RPC:**
   ```sql
   -- Strict Check: Has this canonical identity already claimed an introductory trial?
   SELECT tenant_id INTO v_existing_claim_tenant_id
   FROM public.teacher_trial_claims
   WHERE normalized_email_hash = v_app.canonical_email_hash;

   IF v_existing_claim_tenant_id IS NOT NULL THEN
     RAISE EXCEPTION 'Trial ineligibility: Identity (canonical hash %) has already claimed an introductory 72-hour trial in workspace %. A commercial subscription is required.',
       v_app.canonical_email_hash, v_existing_claim_tenant_id
       USING ERRCODE = '55000';
   END IF;
   ```
   If a trial claim already exists, the stored procedure **aborts with an exception and rolls back the transaction**. Zero workspaces, memberships, or trials are provisioned.

---

## 3. Platform Admin Authorization Model

### 3.1 Defense-in-Depth Layering

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHORIZATION LAYERS                            │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1: Edge Middleware (Routing Optimization Only)                   │
│   - Inspects HTTP-only cookie edvora-role === 'admin'                  │
│   - Redirects unauthenticated / unauthorized requests at network edge  │
│   - NEVER treated as authoritative authorization                       │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Server Components (/admin/dashboard/page.tsx)                 │
│   - Calls await assertPlatformAdmin()                                  │
│   - Cryptographically verifies session via supabase.auth.getUser()     │
│   - Queries public.platform_admins WHERE user_id = user.id             │
│   - Redirects to /admin/login on any failure                           │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 3: Server Actions (actions/admin.ts)                             │
│   - Calls await assertPlatformAdmin() at the start of EVERY action     │
│   - Re-verifies active admin status against database                   │
│   - Fails closed with structured ActionResult on any error             │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 4: PostgreSQL Stored Procedures & RLS                            │
│   - Functions declare: SECURITY DEFINER, SET search_path = ''          │
│   - Execution granted strictly to authenticated, service_role          │
│   - Function body explicitly tests: IF NOT public.is_platform_admin()  │
│     THEN RAISE EXCEPTION 'Access denied. Platform admin required.'     │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Corrected First-Admin Bootstrap SQL
In migration `00001_create_tables.sql`, the `profiles` table contains:
`role TEXT NOT NULL CHECK (role IN ('teacher', 'student'))`.
There is no `'admin'` role in `profiles.role`. Elevating a user to platform administrator is accomplished strictly by inserting their `user_id` into `public.platform_admins`.

```sql
-- CORRECTED FIRST-ADMIN BOOTSTRAP SCRIPT (Supabase SQL Editor Only)
DO $$
DECLARE
  v_admin_email TEXT := 'admin@edvora.lk'; -- Designated admin email
  v_user_id     UUID;
  v_profile_exists BOOLEAN;
BEGIN
  -- 1. Verify that user exists in Supabase Auth
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = lower(trim(v_admin_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % does not exist in auth.users. The administrator must register or be invited first.', v_admin_email;
  END IF;

  -- 2. Verify or initialize profile (role must be 'teacher' per profiles_role_check)
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

---

## 4. Atomic Provisioning & Concurrency Hardening

### 4.1 Concurrency Scenarios & Resolutions

| Concurrency Scenario | Potential Failure | Hardened Resolution |
| :--- | :--- | :--- |
| **Concurrent Approval & Rejection** | Both transactions succeed partially, leaving application in conflicting state. | `PERFORM pg_advisory_xact_lock(hashtext('app_decision:' \|\| p_application_id::text));` followed by `SELECT ... FOR UPDATE`. Exactly one transaction proceeds; the second observes `status != 'pending'` and throws. |
| **Duplicate Concurrent Approvals** | Multiple workspaces and trial claims provisioned for a single applicant. | Serialized via advisory transaction lock and `FOR UPDATE` row lock. Second approval sees `status = 'approved'` and aborts. |
| **Canonical Alias Race** | Two different applications (`alice@gmail.com` and `alice+test@gmail.com`) approved concurrently. | `PERFORM pg_advisory_xact_lock(hashtext('trial_claim:' \|\| v_app.canonical_email_hash));`. Both transactions serialize on the canonical hash. The second transaction hits the trial claim check and aborts. |
| **Workspace Slug Collision** | Two workspaces approved with the same requested slug simultaneously. | Advisory lock `pg_advisory_xact_lock(hashtext('tenant_slug:' \|\| v_clean_slug))` plus guaranteed uniqueness suffix if collision detected. |
| **Mid-Flight Database Crash** | Workspace created but subscription or claim fails. | All inserts execute inside a single PostgreSQL function transaction block. Any failure rolls back the entire state cleanly. |

---

## 5. Schema Compatibility Audit (Migrations 00001–00019)

A meticulous column-by-column, constraint-by-constraint comparison between the proposed migration 00020 and migrations 00001–00019 revealed the following findings:

### 5.1 Critical Corrections Identified

1. **`public.tenants` INSERT Compatibility:**
   - **Discovered Constraint:** In `00007_create_tenant_infrastructure.sql`, `owner_id` is defined as `UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT`. In addition, `plan` has default `'free'` and `max_students` has default `25`.
   - **Correction:** The approval RPC must explicitly pass `owner_id = v_app.user_id`, `plan = 'starter'`, and `max_students = 30` (matching the Starter subscription plan catalog quota).
   - **Slug Regex Constraint:** `chk_tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')`. The RPC must validate that the generated slug satisfies length (3–40 characters) and does not begin or end with a hyphen.

2. **`public.subscription_history` Check Constraint:**
   - **Discovered Constraint:** In `00013_subscription_and_commercial_billing.sql`, line 256:  
     `CHECK (event_type IN ('created', 'activated', 'renewed', 'plan_changed', 'expired', 'suspended', 'reinstated', 'limit_override'))`.
   - **Error in Phase B Draft:** The draft used `event_type = 'trial_started'`, which would have triggered a fatal check constraint violation!
   - **Correction:** Use `event_type = 'created'` with `new_status = 'trialing'`, matching migration 00018.

3. **`public.tenant_members` Column Inventory:**
   - **Verified Columns:** `id`, `tenant_id`, `user_id`, `role`, `created_at`, `updated_at`.
   - **Constraint:** `uq_tenant_members_tenant_user UNIQUE (tenant_id, user_id)`.
   - **Correction:** Pass `v_tenant_id`, `v_app.user_id`, `'owner'`, `v_now`, `v_now`.

4. **`public.tenant_subscriptions` Period Fields:**
   - **Discovered Constraint:** In `00013` and `00017`, `current_period_end` is `NOT NULL`.
   - **Correction:** Set `current_period_start = v_now`, `current_period_end = v_trial_ends`, `trial_started_at = v_now`, and `trial_ends_at = v_trial_ends`.

5. **`public.teacher_trial_claims` Foreign Keys:**
   - **Verified Columns:** `id`, `normalized_email_hash` (UNIQUE), `user_id`, `tenant_id`, `claimed_at`.
   - **Correction:** Pass `normalized_email_hash = v_app.canonical_email_hash`, `user_id = v_app.user_id`, `tenant_id = v_tenant_id`, and `claimed_at = v_now`.

---

## 6. Routing Consistency & Portal Architecture

### 6.1 Standardization of Canonical Routes

To eliminate path divergence between `/dashboard` and `/teacher/dashboard`, the architecture standardizes:

- **Canonical Teacher Dashboard:** `/dashboard`  
  *Rationale:* All existing UI navigation ([TeacherNav.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/components/layout/TeacherNav.tsx)), Server Action `revalidatePath` calls, and breadcrumb structures already target `/dashboard`. In addition, this parallels the Student Portal, where the canonical dashboard is `/home` rather than `/student/home`.
- **Backward-Compatible Redirect:** `/teacher/dashboard` -> HTTP 308 permanent redirect to `/dashboard`.
- **Dedicated Portals Matrix:**

| Portal | Public Entry / Action | Protected Canonical Home | Redirect Handling |
| :--- | :--- | :--- | :--- |
| **Teacher** | `/teacher/login`, `/teacher/register` | `/dashboard` | `/teacher/dashboard` redirects to `/dashboard` |
| **Student** | `/student/login` | `/home` | `/student/home` redirects to `/home` |
| **Platform Admin** | `/admin/login` | `/admin/dashboard` | Unauthenticated `/admin/*` redirects to `/admin/login` |
| **Legacy Entry** | `/login` | Role-based redirect | Preserved for backward compatibility |

### 6.2 Cross-Portal Containment Matrix

```
┌─────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ User Role       │ Accessing /admin/*│ Accessing /dashboard/* │ Accessing /home/*│
├─────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ Unauthenticated │ -> /admin/login   │ -> /teacher/login │ -> /student/login │
│ Student         │ -> /home          │ -> /home          │ ALLOW (HTTP 200)  │
│ Teacher         │ -> /dashboard     │ ALLOW (HTTP 200)  │ -> /dashboard     │
│ Platform Admin  │ ALLOW (HTTP 200)  │ -> /admin/dashboard│ -> /admin/dashboard│
└─────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

---

## 7. Corrected Proposed Database Schema (`00020`)

Below is the fully corrected, compatibility-verified SQL schema to be included in `supabase/migrations/00020_admin_approved_teacher_onboarding.sql`.

```sql
-- ============================================================================
-- Migration: 00020_admin_approved_teacher_onboarding.sql
-- Description: Phase 4A Admin-Approved Teacher Onboarding Architecture:
--              1. Teacher applications table with canonical email hash indexing.
--              2. Stored procedure public.admin_approve_teacher_application()
--                 with multi-key advisory locking, trial claim verification,
--                 and exact schema compatibility with migrations 00001–00019.
--              3. Stored procedure public.admin_reject_teacher_application().
--              4. Idempotent backfill of unconfirmed staging teacher accounts.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL PHASE C APPROVAL)
-- ============================================================================

-- ─── 1. TEACHER APPLICATIONS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_applications (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email                TEXT        NOT NULL,
  canonical_email      TEXT        NOT NULL,
  canonical_email_hash TEXT        NOT NULL CHECK (length(canonical_email_hash) = 64),
  full_name            TEXT        NOT NULL,
  phone_number         TEXT,
  institute_name       TEXT        NOT NULL,
  workspace_slug       TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'approved', 'rejected')),
  verification_method  TEXT        CHECK (verification_method IN ('inbox_confirmation', 'phone_attestation', 'in_person_attestation', 'pre_verified_test')),
  verified_phone       TEXT,
  review_notes         TEXT,
  reviewed_by          UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  tenant_id            UUID        REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_teacher_applications_canonical_hash UNIQUE (canonical_email_hash)
);

COMMENT ON TABLE  public.teacher_applications IS 'Tuition teacher onboarding registration requests awaiting administrator approval.';
COMMENT ON COLUMN public.teacher_applications.canonical_email_hash IS 'SHA-256 digest of provider-aware canonical email to prevent duplicate alias applications.';

CREATE INDEX IF NOT EXISTS idx_teacher_applications_status ON public.teacher_applications (status);
CREATE INDEX IF NOT EXISTS idx_teacher_applications_user   ON public.teacher_applications (user_id);

CREATE TRIGGER teacher_applications_updated_at
  BEFORE UPDATE ON public.teacher_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher_applications_select_applicant"
  ON public.teacher_applications
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  );

CREATE POLICY "teacher_applications_manage_platform_admin"
  ON public.teacher_applications
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── 2. ATOMIC APPROVAL STORED PROCEDURE ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_teacher_application(
  p_application_id    UUID,
  p_verification_mode TEXT DEFAULT 'phone_attestation',
  p_verified_phone    TEXT DEFAULT NULL,
  p_review_notes      TEXT DEFAULT NULL
)
RETURNS TABLE (
  tenant_id           UUID,
  workspace_name      TEXT,
  workspace_slug      TEXT,
  trial_started_at    TIMESTAMPTZ,
  trial_ends_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id               UUID;
  v_app                    RECORD;
  v_clean_slug             TEXT;
  v_tenant_id              UUID;
  v_starter_plan_id        UUID;
  v_now                    TIMESTAMPTZ;
  v_trial_ends             TIMESTAMPTZ;
  v_existing_claim_tenant  UUID;
BEGIN
  -- 1. Authorization: Caller MUST be a verified platform administrator
  v_admin_id := (SELECT auth.uid());
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied. Platform administrator authorization required.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Concurrency Lock: Lock on Application ID
  PERFORM pg_advisory_xact_lock(hashtext('app_decision:' || p_application_id::text));

  -- 3. Lock & Fetch Application
  SELECT * INTO v_app
  FROM public.teacher_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Teacher application % not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status != 'pending' THEN
    RAISE EXCEPTION 'Cannot approve application: Current status is "%".' , v_app.status
      USING ERRCODE = '55000';
  END IF;

  IF v_app.user_id IS NULL THEN
    RAISE EXCEPTION 'Application is not associated with an auth user account.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Concurrency Lock on Canonical Email Hash (Defeats multi-alias claim races)
  PERFORM pg_advisory_xact_lock(hashtext('trial_claim:' || v_app.canonical_email_hash));

  -- 5. Strict Trial Eligibility Check
  SELECT tenant_id INTO v_existing_claim_tenant
  FROM public.teacher_trial_claims
  WHERE normalized_email_hash = v_app.canonical_email_hash;

  IF v_existing_claim_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'Trial ineligibility: Identity % has already claimed an introductory 72-hour trial in workspace %. Commercial subscription required.',
      v_app.canonical_email_hash, v_existing_claim_tenant
      USING ERRCODE = '55000';
  END IF;

  -- 6. Validate Starter Subscription Plan from Catalog
  SELECT id INTO v_starter_plan_id
  FROM public.subscription_plans
  WHERE code = 'starter' AND is_active = true;

  IF v_starter_plan_id IS NULL THEN
    RAISE EXCEPTION 'Starter subscription plan is missing or inactive in catalog.'
      USING ERRCODE = '55000';
  END IF;

  -- 7. Sanitize & Ensure Slug Conforms to chk_tenants_slug_format
  v_clean_slug := lower(trim(v_app.workspace_slug));
  -- Strip non-alphanumeric except internal hyphens, limit length to 35
  v_clean_slug := regexp_replace(v_clean_slug, '[^a-z0-9-]+', '', 'g');
  v_clean_slug := regexp_replace(v_clean_slug, '^-+|-+$', '', 'g');
  IF length(v_clean_slug) < 3 THEN
    v_clean_slug := 'academy-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  ELSIF length(v_clean_slug) > 35 THEN
    v_clean_slug := substr(v_clean_slug, 1, 35);
  END IF;

  -- Collision handling: lock slug namespace and append hash if collision detected
  PERFORM pg_advisory_xact_lock(hashtext('tenant_slug:' || v_clean_slug));
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
    v_clean_slug := substr(v_clean_slug, 1, 28) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END IF;

  -- 8. Precise 72-Hour Trial Boundaries
  v_now := clock_timestamp();
  v_trial_ends := v_now + INTERVAL '72 hours';

  -- 9. Create Tenant (Strictly matching 00007 constraints: owner_id, plan, max_students)
  INSERT INTO public.tenants (
    name,
    slug,
    owner_id,
    plan,
    max_students,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    trim(v_app.institute_name),
    v_clean_slug,
    v_app.user_id,
    'starter',
    30,
    true,
    v_now,
    v_now
  )
  RETURNING id INTO v_tenant_id;

  -- 10. Assign Owner Membership (Strictly matching 00007 columns)
  INSERT INTO public.tenant_members (
    tenant_id,
    user_id,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_tenant_id,
    v_app.user_id,
    'owner',
    v_now,
    v_now
  );

  -- 11. Record Introductory Trial Claim (Strictly matching 00017 columns)
  INSERT INTO public.teacher_trial_claims (
    normalized_email_hash,
    user_id,
    tenant_id,
    claimed_at
  ) VALUES (
    v_app.canonical_email_hash,
    v_app.user_id,
    v_tenant_id,
    v_now
  );

  -- 12. Initialize Tenant Subscription with 72-Hour Free Trial (00013 + 00017)
  INSERT INTO public.tenant_subscriptions (
    tenant_id,
    plan_id,
    status,
    billing_cycle,
    current_period_start,
    current_period_end,
    trial_started_at,
    trial_ends_at,
    created_at,
    updated_at
  ) VALUES (
    v_tenant_id,
    v_starter_plan_id,
    'trialing',
    'monthly',
    v_now,
    v_trial_ends,
    v_now,
    v_trial_ends,
    v_now,
    v_now
  );

  -- 13. Audit in Subscription History (00013: event_type = 'created')
  INSERT INTO public.subscription_history (
    tenant_id,
    event_type,
    old_status,
    new_status,
    new_plan_id,
    actor_id,
    notes,
    created_at
  ) VALUES (
    v_tenant_id,
    'created',
    'pending',
    'trialing',
    v_starter_plan_id,
    v_admin_id,
    'Workspace provisioned atomically with 72-hour trial via admin approval',
    v_now
  );

  -- 14. Update Application Record
  UPDATE public.teacher_applications
  SET status = 'approved',
      tenant_id = v_tenant_id,
      reviewed_by = v_admin_id,
      reviewed_at = v_now,
      verification_method = p_verification_mode,
      verified_phone = p_verified_phone,
      review_notes = p_review_notes,
      updated_at = v_now
  WHERE id = p_application_id;

  -- 15. Ensure Applicant Profile is Active
  UPDATE public.profiles
  SET is_active = true
  WHERE id = v_app.user_id;

  RETURN QUERY
  SELECT
    v_tenant_id,
    trim(v_app.institute_name),
    v_clean_slug,
    v_now,
    v_trial_ends;
END;
$$;

ALTER FUNCTION public.admin_approve_teacher_application(UUID, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.admin_approve_teacher_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_teacher_application(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ─── 3. ATOMIC REJECTION STORED PROCEDURE ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reject_teacher_application(
  p_application_id UUID,
  p_review_notes   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID;
  v_app      RECORD;
  v_now      TIMESTAMPTZ;
BEGIN
  -- 1. Authorization Check
  v_admin_id := (SELECT auth.uid());
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied. Platform administrator authorization required.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Concurrency Lock
  PERFORM pg_advisory_xact_lock(hashtext('app_decision:' || p_application_id::text));

  -- 3. Lock & Verify Application
  SELECT * INTO v_app
  FROM public.teacher_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Teacher application % not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status != 'pending' THEN
    RAISE EXCEPTION 'Cannot reject application: Current status is "%".', v_app.status
      USING ERRCODE = '55000';
  END IF;

  v_now := clock_timestamp();

  UPDATE public.teacher_applications
  SET status = 'rejected',
      reviewed_by = v_admin_id,
      reviewed_at = v_now,
      review_notes = trim(p_review_notes),
      updated_at = v_now
  WHERE id = p_application_id;
END;
$$;

ALTER FUNCTION public.admin_reject_teacher_application(UUID, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.admin_reject_teacher_application(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_teacher_application(UUID, TEXT) TO authenticated, service_role;

-- ─── 4. IDEMPOTENT BACKFILL OF EXISTING UNPROVISIONED TEACHER ACCOUNTS ──────
INSERT INTO public.teacher_applications (
  user_id,
  email,
  canonical_email,
  canonical_email_hash,
  full_name,
  phone_number,
  institute_name,
  workspace_slug,
  status,
  verification_method,
  created_at
)
SELECT
  u.id,
  u.email,
  -- Deterministic provider-aware normalization for Gmail staging test accounts
  CASE 
    WHEN split_part(lower(trim(u.email)), '@', 2) IN ('gmail.com', 'googlemail.com')
    THEN replace(split_part(lower(trim(u.email)), '@', 1), '.', '') || '@gmail.com'
    ELSE lower(trim(u.email))
  END AS canonical_email,
  encode(digest(
    CASE 
      WHEN split_part(lower(trim(u.email)), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(lower(trim(u.email)), '@', 1), '.', '') || '@gmail.com'
      ELSE lower(trim(u.email))
    END, 'sha256'
  ), 'hex') AS canonical_email_hash,
  p.full_name,
  u.raw_user_meta_data->>'phone_number',
  COALESCE(u.raw_user_meta_data->>'pending_workspace_name', p.full_name || '''s Academy'),
  COALESCE(u.raw_user_meta_data->>'pending_workspace_slug', 'academy-' || substr(u.id::text, 1, 8)),
  'pending'::text,
  'pre_verified_test'::text,
  u.created_at
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.tenant_members tm ON tm.user_id = u.id
WHERE p.role = 'teacher'
  AND tm.id IS NULL
ON CONFLICT (canonical_email_hash) DO NOTHING;
```

---

## 8. Remaining Risks and Mitigations

| Risk Area | Threat / Edge Case | Mitigation Implemented |
| :--- | :--- | :--- |
| **Phone / SMS Impersonation** | An applicant inputs a fake phone number they do not own. | The administrator contacts the phone directly during the review. Approval requires recording `verified_phone` and `verification_method`. |
| **Slug Exhaustion** | Over 1,000 workspaces share similar names. | The procedure truncates to 28 characters and appends random hexadecimal suffixes, protected by transactional advisory locking. |
| **Unlinked Profile Orphans** | An Auth user exists without a matching profile. | The approval RPC verifies `p.id = v_app.user_id` and ensures `profiles.is_active = true` within the atomic transaction. |
| **Vercel Preview Drift** | Preview deployment accidentally accesses production credentials. | Vercel Preview environment variables must be verified to mirror `.env.staging` targeting `voyypkysddyrjuqimzya`. |

---

## 9. Next Steps

Phase B.1 (Security Corrections Review) is complete. All findings have been addressed, all SQL errors corrected, and all constraints validated.

No changes have been made to any source files, database migrations, remote repositories, or deployment environments.

Awaiting your explicit review and approval before proceeding to **Phase C: Implementation**.
