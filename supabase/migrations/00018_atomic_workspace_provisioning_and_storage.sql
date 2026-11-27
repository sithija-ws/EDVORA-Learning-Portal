-- ============================================================================
-- Migration: 00018_atomic_workspace_provisioning_and_storage.sql
-- Description: Phase 3B2-C.1 Security Audit Remediation:
--              1. Private storage bucket 'payment_slips' and multi-tenant RLS.
--              2. Atomic PostgreSQL stored procedure public.provision_tenant_workspace()
--                 ensuring ACID consistency across tenant, owner membership,
--                 trial claim, and tenant subscription initialization.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. PAYMENT SLIPS PRIVATE STORAGE BUCKET & RLS ───────────────────────────
-- Payment deposit slips contain sensitive financial details (depositor name,
-- bank account numbers, branch, transaction timestamps).
-- Bucket must be strictly private (public = false) and isolated per tenant folder: {tenant_id}/*

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment_slips', 'payment_slips', false)
ON CONFLICT (id) DO UPDATE SET public = false;

UPDATE storage.buckets
SET public = false
WHERE id = 'payment_slips';

-- Clean up any existing policies
DROP POLICY IF EXISTS "payment_slips_upload_tenant_admin"   ON storage.objects;
DROP POLICY IF EXISTS "payment_slips_manage_tenant_admin"   ON storage.objects;
DROP POLICY IF EXISTS "payment_slips_select_authorized"     ON storage.objects;
DROP POLICY IF EXISTS "payment_slips_manage_platform_admin" ON storage.objects;

-- Policy 1: Authenticated tenant administrators or owners can upload payment slips
-- into their own tenant folder: {tenant_id}/*
CREATE POLICY "payment_slips_upload_tenant_admin"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment_slips'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
  );

-- Policy 2: Authenticated tenant administrators or owners can update/delete slips in their folder
CREATE POLICY "payment_slips_manage_tenant_admin"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'payment_slips'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND (
      public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'payment_slips'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND (
      public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
      OR public.is_platform_admin()
    )
  );

-- Policy 3: Reading allowed strictly to tenant administrators of that workspace OR platform admins
CREATE POLICY "payment_slips_select_authorized"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment_slips'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND (
      public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
      OR public.is_platform_admin()
    )
  );

-- ─── 2. ATOMIC WORKSPACE PROVISIONING STORED PROCEDURE ───────────────────────
-- Provisions tenant, owner membership, trial claim check, and subscription
-- inside a single atomic PostgreSQL transaction. Eliminates multi-step REST
-- partial state failures on serverless timeout.

CREATE OR REPLACE FUNCTION public.provision_tenant_workspace(
  p_user_id              UUID,
  p_workspace_name       TEXT,
  p_workspace_slug       TEXT,
  p_canonical_email_hash TEXT
)
RETURNS TABLE (
  tenant_id           UUID,
  name                TEXT,
  slug                TEXT,
  role                TEXT,
  subscription_status TEXT,
  is_trial            BOOLEAN,
  trial_ends_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id          UUID;
  v_user_role          TEXT;
  v_user_active        BOOLEAN;
  v_clean_slug         TEXT;
  v_existing_tenant_id UUID;
  v_tenant_id          UUID;
  v_existing_claim_id  UUID;
  v_starter_plan_id    UUID;
  v_now                TIMESTAMPTZ;
  v_trial_ends         TIMESTAMPTZ;
  v_sub_status         TEXT;
  v_is_trial           BOOLEAN;
BEGIN
  -- 1. Authorization: caller must be service_role, platform admin, or the user themselves
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NOT NULL AND v_caller_id != p_user_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied. You may only provision a workspace for your own account.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify Profile existence, role and active status
  SELECT p.role, p.is_active INTO v_user_role, v_user_active
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_user_role != 'teacher' THEN
    RAISE EXCEPTION 'Only users with role "teacher" may provision a tuition workspace.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_user_active THEN
    RAISE EXCEPTION 'User account is inactive or disabled.' USING ERRCODE = '42501';
  END IF;

  -- 3. Verify user does not already own an active workspace
  SELECT tm.tenant_id INTO v_existing_tenant_id
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = p_user_id
    AND tm.role = 'owner'
    AND t.is_active = true
  LIMIT 1;

  IF v_existing_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'User already owns an active workspace.' USING ERRCODE = '23505';
  END IF;

  -- 4. Clean and sanitize slug
  v_clean_slug := lower(trim(p_workspace_slug));
  IF length(v_clean_slug) = 0 THEN
    v_clean_slug := 'workspace-' || floor(extract(epoch from clock_timestamp()))::text;
  END IF;

  -- Ensure slug uniqueness
  SELECT t.id INTO v_existing_tenant_id
  FROM public.tenants t
  WHERE t.slug = v_clean_slug;

  IF v_existing_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Workspace identifier "%" is already taken. Please choose another name or slug.', v_clean_slug
      USING ERRCODE = '23505';
  END IF;

  -- 5. Fetch Starter subscription plan
  SELECT sp.id INTO v_starter_plan_id
  FROM public.subscription_plans sp
  WHERE sp.code = 'starter' AND sp.is_active = true;

  IF v_starter_plan_id IS NULL THEN
    RAISE EXCEPTION 'Starter subscription plan not found in catalog.' USING ERRCODE = '55000';
  END IF;

  -- 6. Check Introductory Trial Eligibility via Canonical Email Hash
  SELECT c.id INTO v_existing_claim_id
  FROM public.teacher_trial_claims c
  WHERE c.normalized_email_hash = p_canonical_email_hash;

  v_now := clock_timestamp();

  -- 7. Insert Tenant Workspace
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
    trim(p_workspace_name),
    v_clean_slug,
    p_user_id,
    'starter',
    30,
    true,
    v_now,
    v_now
  )
  RETURNING id INTO v_tenant_id;

  -- 8. Assign Owner Membership
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

  -- 9. Setup Trial Claim & Subscription
  IF v_existing_claim_id IS NULL THEN
    -- Eligible for introductory 72-hour trial
    INSERT INTO public.teacher_trial_claims (
      normalized_email_hash,
      user_id,
      tenant_id,
      claimed_at
    ) VALUES (
      p_canonical_email_hash,
      p_user_id,
      v_tenant_id,
      v_now
    );

    v_trial_ends := v_now + interval '72 hours';
    v_sub_status := 'trialing';
    v_is_trial := true;

    INSERT INTO public.tenant_subscriptions (
      tenant_id,
      plan_id,
      status,
      billing_cycle,
      trial_started_at,
      trial_ends_at,
      current_period_start,
      current_period_end,
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

    INSERT INTO public.subscription_history (
      tenant_id,
      event_type,
      old_status,
      new_status,
      new_plan_id,
      actor_id,
      notes
    ) VALUES (
      v_tenant_id,
      'created',
      'pending',
      'trialing',
      v_starter_plan_id,
      p_user_id,
      'Workspace provisioned atomically with 72-hour introductory trial.'
    );
  ELSE
    -- Duplicate registration by previously trialed canonical email identity
    v_trial_ends := NULL;
    v_sub_status := 'expired';
    v_is_trial := false;

    INSERT INTO public.tenant_subscriptions (
      tenant_id,
      plan_id,
      status,
      billing_cycle,
      trial_started_at,
      trial_ends_at,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      v_tenant_id,
      v_starter_plan_id,
      'expired',
      'monthly',
      NULL,
      NULL,
      v_now,
      v_now,
      v_now,
      v_now
    );

    INSERT INTO public.subscription_history (
      tenant_id,
      event_type,
      old_status,
      new_status,
      new_plan_id,
      actor_id,
      notes
    ) VALUES (
      v_tenant_id,
      'created',
      'pending',
      'expired',
      v_starter_plan_id,
      p_user_id,
      'Workspace provisioned without trial: canonical email identity previously claimed introductory trial.'
    );
  END IF;

  RETURN QUERY
  SELECT
    v_tenant_id,
    trim(p_workspace_name),
    v_clean_slug,
    'owner'::TEXT,
    v_sub_status,
    v_is_trial,
    v_trial_ends;
END;
$$;

ALTER FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) TO service_role;
