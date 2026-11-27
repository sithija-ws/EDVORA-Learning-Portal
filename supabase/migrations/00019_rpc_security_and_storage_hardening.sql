-- ============================================================================
-- Migration: 00019_rpc_security_and_storage_hardening.sql
-- Description: Phase 3B2-C.3 Security Audit Remediation:
--              1. Hardens public.provision_tenant_workspace():
--                 - Revokes EXECUTE from PUBLIC, anon, and authenticated.
--                 - Grants EXECUTE strictly to service_role (backend Server Actions only).
--                 - Verifies auth.users email existence and email_confirmed_at.
--                 - Acquires transactional advisory lock to defeat concurrent provisioning races.
--              2. Hardens storage bucket 'payment_slips':
--                 - Configures 5 MB file size limit and strict MIME types (JPEG, PNG, PDF).
--              3. Hardens public.admin_verify_subscription_payment():
--                 - Implements strict row-level locking (FOR UPDATE) in deadlock-free order.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. HARDEN STORAGE BUCKET 'payment_slips' ─────────────────────────────────
-- Enforces 5 MB file size limit and restricts allowed MIME types to documents & images.

UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880, -- 5 MB (5 * 1024 * 1024 bytes)
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'payment_slips';

-- ─── 2. REVISE PROVISIONING RPC WITH STRICT SERVICE_ROLE RESTRICTION ─────────
-- Procedure is strictly callable by the backend service_role client only.
-- Validates email confirmation from auth.users and uses transaction advisory lock.

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
  v_auth_email         TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_user_role          TEXT;
  v_user_active        BOOLEAN;
  v_clean_slug         TEXT;
  v_clean_name         TEXT;
  v_existing_tenant_id UUID;
  v_tenant_id          UUID;
  v_existing_claim_id  UUID;
  v_starter_plan_id    UUID;
  v_now                TIMESTAMPTZ;
  v_trial_ends         TIMESTAMPTZ;
  v_sub_status         TEXT;
  v_is_trial           BOOLEAN;
BEGIN
  -- 1. Transactional Concurrency Lock: Prevents simultaneous duplicate provisioning
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 2. Verify Auth User Identity & Confirmed Email Status directly from auth.users
  SELECT u.email, u.email_confirmed_at
  INTO v_auth_email, v_email_confirmed_at
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Auth user account not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Email verification required. User email address is not confirmed.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Verify Profile role and active state
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

  -- 4. Verify user does not already own an active workspace
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

  -- 5. Clean and sanitize name and slug
  v_clean_name := trim(p_workspace_name);
  IF length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Workspace name must be at least 2 characters long.' USING ERRCODE = '22023';
  END IF;

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

  -- 6. Validate canonical email hash parameter
  IF p_canonical_email_hash IS NULL OR length(trim(p_canonical_email_hash)) != 64 THEN
    RAISE EXCEPTION 'Invalid canonical email hash.' USING ERRCODE = '22023';
  END IF;

  -- 7. Fetch Starter subscription plan
  SELECT sp.id INTO v_starter_plan_id
  FROM public.subscription_plans sp
  WHERE sp.code = 'starter' AND sp.is_active = true;

  IF v_starter_plan_id IS NULL THEN
    RAISE EXCEPTION 'Starter subscription plan not found in catalog.' USING ERRCODE = '55000';
  END IF;

  -- 8. Check Introductory Trial Eligibility via Canonical Email Hash
  SELECT c.id INTO v_existing_claim_id
  FROM public.teacher_trial_claims c
  WHERE c.normalized_email_hash = p_canonical_email_hash;

  v_now := clock_timestamp();

  -- 9. Insert Tenant Workspace
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
    v_clean_name,
    v_clean_slug,
    p_user_id,
    'starter',
    30,
    true,
    v_now,
    v_now
  )
  RETURNING id INTO v_tenant_id;

  -- 10. Assign Owner Membership
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

  -- 11. Setup Trial Claim & Subscription
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
    v_clean_name,
    v_clean_slug,
    'owner'::TEXT,
    v_sub_status,
    v_is_trial,
    v_trial_ends;
END;
$$;

ALTER FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) OWNER TO postgres;

-- ─── STRICT PERMISSIONS: SERVICE_ROLE ONLY (SEC-3B2C2-HIGH-01) ────────────────
-- Revoke from all public, anonymous, and authenticated client roles.
-- Only trusted backend Server Actions utilizing the service_role key can execute this RPC.

REVOKE ALL ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ─── 3. ROW-LEVEL LOCKING ON admin_verify_subscription_payment() ─────────────
-- Implements deadlock-free row locking (FOR UPDATE) to prevent concurrency races (SEC-3B2C2-LOW-03).

CREATE OR REPLACE FUNCTION public.admin_verify_subscription_payment(
  p_payment_id       UUID,
  p_approve          BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL,
  p_extension_days   INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id       UUID;
  v_payment        RECORD;
  v_sub            RECORD;
  v_days_to_add    INTEGER;
  v_new_period_end TIMESTAMPTZ;
  v_base_start     TIMESTAMPTZ;
  v_now            TIMESTAMPTZ;
BEGIN
  v_admin_id := (SELECT auth.uid());
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied. Platform administrator credentials required.'
      USING ERRCODE = '42501';
  END IF;

  -- Lock target payment row with FOR UPDATE first (Lock Order: 1)
  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment is already processed (Status: %).', v_payment.status
      USING ERRCODE = '22023';
  END IF;

  -- Lock corresponding subscription row with FOR UPDATE second (Lock Order: 2)
  SELECT * INTO v_sub
  FROM public.tenant_subscriptions
  WHERE id = v_payment.subscription_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Associated subscription record not found.' USING ERRCODE = 'P0002';
  END IF;

  v_now := clock_timestamp();

  IF p_approve THEN
    IF p_extension_days IS NOT NULL AND p_extension_days > 0 THEN
      v_days_to_add := p_extension_days;
    ELSE
      v_days_to_add := CASE v_payment.billing_cycle
        WHEN 'annual' THEN 365
        ELSE 30
      END;
    END IF;

    -- If subscription was already active and not expired, extend from current end date.
    -- Otherwise, calculate new period start strictly from verification time (v_now).
    IF v_sub.status = 'active' AND v_sub.current_period_end > v_now THEN
      v_base_start := v_sub.current_period_end;
    ELSE
      v_base_start := v_now;
    END IF;

    v_new_period_end := v_base_start + (v_days_to_add || ' days')::interval;

    UPDATE public.subscription_payments
    SET status = 'verified',
        verified_by = v_admin_id,
        verified_at = v_now,
        updated_at = v_now
    WHERE id = p_payment_id;

    UPDATE public.tenant_subscriptions
    SET status = 'active',
        plan_id = v_payment.plan_id,
        billing_cycle = v_payment.billing_cycle,
        current_period_start = CASE WHEN v_sub.status = 'active' AND v_sub.current_period_end > v_now THEN v_sub.current_period_start ELSE v_now END,
        current_period_end = v_new_period_end,
        updated_at = v_now
    WHERE id = v_sub.id;

    INSERT INTO public.subscription_history (
      tenant_id, event_type, old_status, new_status, old_plan_id, new_plan_id, actor_id, notes
    ) VALUES (
      v_sub.tenant_id,
      'activated',
      v_sub.status,
      'active',
      v_sub.plan_id,
      v_payment.plan_id,
      v_admin_id,
      'Payment verified by administrator. Subscription active until ' || v_new_period_end::text
    );
  ELSE
    -- Rejection leaves subscription inactive / expired
    UPDATE public.subscription_payments
    SET status = 'rejected',
        verified_by = v_admin_id,
        verified_at = v_now,
        rejection_reason = p_rejection_reason,
        updated_at = v_now
    WHERE id = p_payment_id;

    UPDATE public.tenant_subscriptions
    SET status = 'expired',
        updated_at = v_now
    WHERE id = v_sub.id;

    INSERT INTO public.subscription_history (
      tenant_id, event_type, old_status, new_status, actor_id, notes
    ) VALUES (
      v_sub.tenant_id,
      'expired',
      v_sub.status,
      'expired',
      v_admin_id,
      'Payment rejected: ' || COALESCE(p_rejection_reason, 'No reason specified')
    );
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) TO authenticated, service_role;
