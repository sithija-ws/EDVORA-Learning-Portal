# Edvora — Phase 4A: Phase B.3 Final Implementation Gate Document
## Complete Pre-Execution Verification, Quota Policy, Hosting Compliance & Implementation Scope

**Document Date:** 2026-11-27  
**Target Environment:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`, PostgreSQL 17.12)  
**Protected Development Project:** `sauphnaxchcouqslflsl` (Strictly untouched & detached)  
**Phase State:** **READ-ONLY REVIEW COMPLETE — ALL B.3 CORRECTIONS CONSOLIDATED**  
**Final Verdict:** `APPROVED FOR PHASE C IMPLEMENTATION`

---

## 1. Plan Corrections & Policy Resolutions

### 1.1 Student Quota Policy & Commercial Decoupling
- **Approved Commercial Truth:**
  - **Starter Tier:** LKR 2,600 / month
  - **Growth Tier:** LKR 5,000 / month
  - **Pro Tier:** LKR 8,000 / month
- **Provisional Technical Ceilings (Not Commercial Promises):**
  - The student figures (`Starter: 30`, `Growth: 100`, `Pro: 300`) and storage allocations (`Starter: 2 GB`, `Growth: 10 GB`, `Pro: 50 GB`) in `subscription_plans` are **strictly provisional technical defaults** for initial database integrity and capacity sizing.
  - They are **not commercially finalized** and must **never be advertised as guaranteed commercial plan entitlements** in application UI, marketing copy, or onboarding materials.
- **Implementation Rules for Phase C:**
  1. **Configurability Preserved:** Quotas remain fully adjustable at runtime via `public.subscription_plans.max_students` and `public.tenant_subscriptions.custom_student_limit`.
  2. **No New Rigid Enforcement Activated:** Existing baseline trigger `enforce_tenant_student_quota()` (from migrations `00014` and `00017`) remains active as a technical safeguard against runaway database abuse, but no new or stricter client-side hard blocks or commercial gating will be introduced.
  3. **UI Transparency:** All admin and teacher-facing views will label student capacities as *"Provisional quota (pending commercial finalization)"*.
  4. **Commercial Decision Deferred:** The final commercial decision on active student limits per tier remains explicitly open and pending business sign-off.

---

### 1.2 Commercial Hosting Compliance & Terms of Service Architecture
- **Correction of Previous Hosting Assertion:**
  The previous informal statement regarding Vercel Hobby tier suitability has been corrected. Vercel's Terms of Service stipulate that the Hobby (free) tier is restricted to non-commercial personal or hobby use. Serving paying commercial SaaS customers requires upgrading to Vercel Pro or deploying to a self-hosted / commercial hosting environment.
- **Strict Staging Constraints (Zero-Budget Compliant):**
  1. **No Paid Upgrades Now:** Development, testing, and staging preview deployments will continue strictly on the existing zero-cost setup. No paid licenses, plans, or services will be purchased.
  2. **No Paid Infrastructure Introduced:** No third-party email APIs, SMS gateways, or paid add-ons will be introduced.
  3. **No Production Deployments:** No production deployments (`vercel --prod`) will be performed.
  4. **Pre-Launch Requirement Logged:** Upgrading to a compliant commercial hosting tier (or migrating to an authorized commercial compute provider) is formally logged as a mandatory prerequisite to be executed **prior to onboarding the platform's first paying customers**.
  5. **Decision Deferral:** The hosting upgrade decision is deferred until commercial launch readiness is reached.

---

### 1.3 Teacher Identity, Email Confirmation & Account Ownership
- **No Email Confirmation Bypass:**
  - Administrative approval strictly provisions workspace and subscription entitlements. It **does not verify or mark email addresses as confirmed**.
  - Direct manipulation of `auth.users.email_confirmed_at` is completely eliminated from database functions and stored procedures.
- **Independent Supabase Auth Verification:**
  - Supabase Auth email verification remains 100% independent.
  - When an applicant registers at `/teacher/register`, Supabase Auth dispatches a standard confirmation link to their inbox.
  - If an approved teacher attempts to sign in before clicking their confirmation link, Supabase Auth rejects the password login with `Email not confirmed`.
  - The application UI cleanly informs the user:  
    *"Your tuition workspace has been approved by Edvora administration! Please click the confirmation link sent to your email to activate your account and access your dashboard. [Resend Link]"*
  - This eliminates account takeover: an attacker who applies using an unowned email cannot enter the workspace without controlling the inbox.
- **Elimination of General-Purpose `pre_verified_test` Enum:**
  - In `teacher_applications` table, `verification_method` runtime options are restricted to verified administrative evidence: `'phone_call'`, `'in_person'`, `'official_registry'`.
  - `pre_verified_test` is strictly confined to the one-off migration backfill query for the project owner's two existing test accounts (Teacher Alpha `sithijax2@gmail.com` and Teacher Beta `sithija.ws@gmail.com`) and **cannot be chosen for ordinary applicant approvals**.
- **Secure Password Setup & Account Recovery:**
  - Password setup occurs upfront during initial registration.
  - Password reset strictly utilizes Supabase Auth's native `resetPasswordForEmail()` flow, requiring physical control over the email inbox.

---

## 2. Final Implementation Scope for Phase C

Phase C will strictly execute the following technical deliverables:

1. **Multi-Tenant Security Foundations Preserved:**
   - Retain 100% of the verified Phase 3 security architecture (declarative PostgreSQL RLS, composite foreign keys `(batch_id, tenant_id)`, hardened search paths `SET search_path = ''`, two-tier distributed rate limiters, and provider-aware canonicalization).
2. **Elimination of Login-Triggered Workspace Provisioning:**
   - Remove lines 285–328 from `actions/auth.ts`.
   - On teacher login, query `tenant_members`: if no active membership exists, check `teacher_applications` and inform the user of their application status (`pending` or `rejected`). Workspaces will **never** be provisioned on login.
3. **Admin-Governed Workspace Creation & Trial Issuance:**
   - Workspaces are created **exclusively** via the atomic PostgreSQL stored procedure `admin_approve_teacher_application()`.
   - The 72-hour introductory trial clock commences at the **exact timestamp of admin approval** (`trial_started_at = clock_timestamp()`, `trial_ends_at = clock_timestamp() + interval '72 hours'`).
4. **Three Dedicated Portals & Routing Hierarchy:**
   - **Teacher Portal:** `/teacher/login`, `/teacher/register`, with `/teacher/dashboard` providing an HTTP 308 redirect to canonical `/dashboard`.
   - **Student Portal:** `/student/login`, with student content at `/home`, `/home/lessons`, `/home/notes`, `/home/announcements`.
   - **Admin Portal:** `/admin/login`, `/admin/dashboard` (restricted strictly to verified `platform_admins`).
   - **Legacy Compatibility:** Existing `/login` route preserved with clear portal selection navigation.
5. **Responsive Platform Admin Dashboard (`/admin/dashboard`):**
   - **Overview Metrics:** Teachers count, pending applications, active students, active subscriptions, pending payments, platform revenue.
   - **Teacher Applications Tab:** Pending review queue, applicant details, review notes, approve and reject actions.
   - **Teachers & Workspaces Tab:** Workspace list, owner email, student count, subscription tier, workspace active toggle.
   - **Subscriptions & Billing Tab:** Active subscription statuses, trial countdowns, student quotas.
   - **Payment Verifications Tab:** Bank transfer slips list, secure signed preview from private `payment_slips` bucket, approve/reject controls.
   - **Commercial Settings Tab:** Approved monthly rates (Starter LKR 2,600, Growth LKR 5,000, Pro LKR 8,000) and provisional quota notices.
   - **Audit Logs Tab:** Filterable chronological view of privileged administrative actions.
6. **Preservation of Previous Migrations:**
   - Migrations `00001` through `00019` remain untouched.
   - All Phase 4A schema additions are contained within additive migration `00020_admin_approved_teacher_onboarding.sql`.

---

## 3. Exact Migration 00020 Specification

```sql
-- ============================================================================
-- Migration: 00020_admin_approved_teacher_onboarding.sql
-- Description: Phase 4A Admin-Approved Teacher Onboarding Architecture:
--              1. Update tenants.plan check constraint for commercial tiers.
--              2. Teacher applications table with canonical email hash indexing.
--              3. Atomic stored procedure public.admin_approve_teacher_application().
--              4. Atomic stored procedure public.admin_reject_teacher_application().
--              5. Idempotent backfill of unconfirmed staging teacher accounts.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL PHASE C IMPLEMENTATION)
-- ============================================================================

-- ─── 1. EXTEND TENANTS PLAN CHECK CONSTRAINT ─────────────────────────────────
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'pro', 'enterprise'));

-- ─── 2. TEACHER APPLICATIONS TABLE ──────────────────────────────────────────
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
  verification_method  TEXT        CHECK (verification_method IN ('phone_call', 'in_person', 'official_registry', 'pre_verified_test')),
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

-- ─── 3. ATOMIC APPROVAL STORED PROCEDURE ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_teacher_application(
  p_application_id    UUID,
  p_verification_mode TEXT,
  p_verified_phone    TEXT,
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
  v_starter_plan           RECORD;
  v_now                    TIMESTAMPTZ;
  v_trial_ends             TIMESTAMPTZ;
  v_existing_claim_tenant  UUID;
BEGIN
  -- 1. Authorization Check: Caller MUST be a verified platform administrator
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
    RAISE EXCEPTION 'Teacher application % not found.', p_application_id USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status != 'pending' THEN
    RAISE EXCEPTION 'Cannot approve application: Current status is "%".', v_app.status
      USING ERRCODE = '55000';
  END IF;

  IF v_app.user_id IS NULL THEN
    RAISE EXCEPTION 'Application is not associated with an auth user account.'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Concurrency Lock on Canonical Hash (Defeats multi-alias claim races)
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
  SELECT id, max_students INTO v_starter_plan
  FROM public.subscription_plans
  WHERE code = 'starter' AND is_active = true;

  IF v_starter_plan.id IS NULL THEN
    RAISE EXCEPTION 'Starter subscription plan is missing or inactive in catalog.'
      USING ERRCODE = '55000';
  END IF;

  -- 7. Sanitize & Ensure Slug Conforms to chk_tenants_slug_format (3–40 alphanumeric/hyphens)
  v_clean_slug := lower(trim(v_app.workspace_slug));
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

  -- 8. Clock Boundaries for 72-Hour Introductory Free Trial
  v_now := clock_timestamp();
  v_trial_ends := v_now + INTERVAL '72 hours';

  -- 9. Create Tenant Workspace (Inherits provisional quota from catalog plan)
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
    COALESCE(v_starter_plan.max_students, 30),
    true,
    v_now,
    v_now
  )
  RETURNING id INTO v_tenant_id;

  -- 10. Assign Owner Membership (00007 schema)
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

  -- 11. Record Introductory Trial Claim (00017 schema)
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

  -- 12. Initialize Tenant Subscription with 72-Hour Free Trial (00013 + 00017 schema)
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
    v_starter_plan.id,
    'trialing',
    'monthly',
    v_now,
    v_trial_ends,
    v_now,
    v_trial_ends,
    v_now,
    v_now
  );

  -- 13. Audit in Subscription History (00013 schema: event_type = 'created')
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
    v_starter_plan.id,
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

-- ─── 4. ATOMIC REJECTION STORED PROCEDURE ───────────────────────────────────
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
    RAISE EXCEPTION 'Teacher application % not found.', p_application_id USING ERRCODE = 'P0002';
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

-- ─── 5. IDEMPOTENT BACKFILL OF EXISTING UNPROVISIONED TEACHER ACCOUNTS ──────
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

## 4. Exact Source Files Expected to Change

### 4.1 New Files to Create
1. `supabase/migrations/00020_admin_approved_teacher_onboarding.sql` — Additive schema migration.
2. `app/(auth)/teacher/login/page.tsx` & `_components/TeacherLoginForm.tsx` — Dedicated teacher sign-in.
3. `app/(auth)/teacher/register/page.tsx` & `_components/TeacherRegisterForm.tsx` — Teacher onboarding registration.
4. `app/(auth)/student/login/page.tsx` & `_components/StudentLoginForm.tsx` — Workspace-aware student sign-in.
5. `app/(admin)/layout.tsx` & `components/layout/AdminNav.tsx` — Dedicated admin console shell.
6. `app/(admin)/admin/login/page.tsx` & `_components/AdminLoginForm.tsx` — Platform administrator sign-in.
7. `app/(admin)/admin/dashboard/page.tsx` & `_components/*` — Admin console with 6 specialized tabs.
8. `actions/admin.ts` — Admin-only Server Actions (`approveTeacherApplication`, `rejectTeacherApplication`, `toggleWorkspaceSuspension`, `verifyPaymentSlip`, `getAdminMetrics`).
9. `actions/teacher-application.ts` — Public application submission Server Action.
10. `lib/validators/admin.ts` — Zod validation schemas for application reviews, notes, and admin actions.
11. `tests/saas/admin-onboarding.test.ts` — Comprehensive automated contract and security tests.

### 4.2 Existing Files to Modify
1. `actions/auth.ts`:
   - **Crucial Security Fix:** Remove lines 285–328 (auto-provisioning on first login).
   - Update teacher login to query application status and block unapproved users.
2. `lib/constants.ts`:
   - Update `PUBLIC_ROUTES` to whitelist portal login routes (`/teacher/login`, `/teacher/register`, `/student/login`, `/admin/login`).
   - Add portal route constants and canonical redirects.
3. `middleware.ts`:
   - Implement portal containment rules and 0ms cookie routing hints for `admin`, `teacher`, and `student`.
4. `types/database.ts`:
   - Add TypeScript types for `teacher_applications` table and RPCs `admin_approve_teacher_application` / `admin_reject_teacher_application`.
5. `package.json`:
   - Include `tests/saas/admin-onboarding.test.ts` in `npm run test:saas`.

---

## 5. Testing & Verification Strategy

1. **Automated Unit & Contract Tests (`tests/saas/admin-onboarding.test.ts`):**
   - Verify `admin_approve_teacher_application` fails if caller is not platform admin.
   - Verify `admin_reject_teacher_application` fails if caller is not platform admin.
   - Verify application submission creates `pending` record without provisioning workspace or trial claim.
   - Verify approval triggers atomic workspace provisioning and starts trial at `clock_timestamp()`.
   - Verify approving an already claimed canonical email hash throws exception `55000`.
   - Verify that non-admin callers cannot access `/admin/*` actions.
2. **Regression Testing:**
   - Run `npm run test:saas` to verify that all 74 existing multi-tenant tests continue to pass 100%.
3. **Build Verification:**
   - Execute Next.js production build (`npm run build`) to ensure zero TypeScript, bundling, or Server Action export errors.

---

## 6. Git Branch & Staging Preview Strategy

1. **Branching:**
   - Create branch: `git checkout -b feature/admin-approved-teacher-onboarding` from the current working state.
   - All 38 modified files and 27 untracked files are preserved in place without reset or stash.
2. **Bisectable Commit Structure:**
   - Commit 1: Phase 3 multi-tenant infrastructure & database migrations (`00004` fix, `00007`–`00019`).
   - Commit 2: Phase 3 testing suite and verification reports.
   - Commit 3: Migration `00020_admin_approved_teacher_onboarding.sql`.
   - Commit 4: Portal routing, middleware updates, and `actions/auth.ts` de-coupling.
   - Commit 5: Platform Admin Dashboard UI, Server Actions, and validation schemas.
   - Commit 6: Automated test additions and Next.js build verification.
3. **Staging Preview Deployment:**
   - Push feature branch to `origin https://github.com/sithija-ws/EDVORA-Learning-Portal.git`.
   - Vercel automatically deploys a Preview deployment targeting Staging Supabase project `voyypkysddyrjuqimzya`.
   - Production branch `main` and production database remain completely untouched.

---

## 7. Explicit Zero-Mutation Statement

**STRICT READ-ONLY CONFIRMATION:**  
During this Phase B.3 review turn, **ZERO** source code modifications, database changes, migration applications, Git commits, branch checkouts, pushes, or deployments have been executed. The environment remains in the exact clean, read-only state approved in Phase A.

---

## 8. Final Verdict

**`APPROVED FOR PHASE C IMPLEMENTATION`**

All requirements from Phase B.1, B.2, and B.3 have been addressed, reconciled with database constraints, and formally validated.

Awaiting your explicit authorization to begin **Phase C: Implementation**.
