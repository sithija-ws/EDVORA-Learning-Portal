-- ============================================================================
-- Migration: 00020_admin_approved_teacher_onboarding.sql
-- Description: Phase 4A Admin-Approved Teacher Onboarding Architecture:
--              1. Update tenants.plan check constraint for commercial tiers.
--              2. Teacher applications table with canonical email hash indexing.
--              3. Atomic stored procedure public.admin_approve_teacher_application().
--              4. Atomic stored procedure public.admin_reject_teacher_application().
--              5. Idempotent backfill of unconfirmed staging teacher accounts.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL EXPLICITLY AUTHORIZED)
-- ============================================================================

-- ─── 1. EXTEND TENANTS PLAN CHECK CONSTRAINT ─────────────────────────────────
-- Migration 00007 established CHECK (plan IN ('free', 'pro', 'enterprise')).
-- Update constraint to support commercial SaaS tiers: starter, growth, pro.
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'pro', 'enterprise'));

-- ─── 2. TEACHER APPLICATIONS TABLE ──────────────────────────────────────────
-- Onboarding registry for tuition educators requesting workspace provisioning.
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
COMMENT ON COLUMN public.teacher_applications.status IS 'Application lifecycle: pending review, approved (workspace provisioned), or rejected.';

CREATE INDEX IF NOT EXISTS idx_teacher_applications_status ON public.teacher_applications (status);
CREATE INDEX IF NOT EXISTS idx_teacher_applications_user   ON public.teacher_applications (user_id);

CREATE TRIGGER teacher_applications_updated_at
  BEFORE UPDATE ON public.teacher_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

-- Applicants can view their own application
CREATE POLICY "teacher_applications_select_applicant"
  ON public.teacher_applications
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  );

-- Platform administrators have full management access
CREATE POLICY "teacher_applications_manage_platform_admin"
  ON public.teacher_applications
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── 3. ATOMIC APPROVAL STORED PROCEDURE ────────────────────────────────────
-- Atomically provisions workspace, owner membership, trial claim, and subscription
-- inside a single transaction. Completely decoupled from auth.users.email_confirmed_at.
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

  -- 9. Create Tenant Workspace (Strictly matching 00007 schema: owner_id, plan, max_students)
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
  -- 1. Authorization Check: Caller MUST be a verified platform administrator
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
-- Explicitly backfills only the authorized staging test accounts (Teacher Alpha & Beta).
-- Canonical hashes match the exact output of lib/auth/canonical.ts.
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
