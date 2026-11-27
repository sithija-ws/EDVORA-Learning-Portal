-- ============================================================================
-- Migration: 00017_trial_and_teacher_registration.sql
-- Description: 72-hour introductory trial lifecycle, teacher trial claim
--              abuse prevention, subscription status expansion ('trialing',
--              'pending_payment'), active subscription evaluation with
--              clock_timestamp(), and payment rejection handling.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. EXPAND TENANT SUBSCRIPTIONS TABLE ───────────────────────────────────
-- Add 'trialing' and 'pending_payment' statuses and trial timestamp boundaries.

ALTER TABLE public.tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_status_check;

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_status_check
  CHECK (status IN ('pending', 'trialing', 'active', 'expired', 'suspended', 'pending_payment'));

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.tenant_subscriptions.trial_started_at IS 'Database timestamp when the 72-hour introductory trial commenced.';
COMMENT ON COLUMN public.tenant_subscriptions.trial_ends_at    IS 'Strict database timestamp when the 72-hour introductory trial terminates.';

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_trial_ends
  ON public.tenant_subscriptions (trial_ends_at)
  WHERE status = 'trialing';

-- ─── 2. TEACHER TRIAL CLAIMS (ABUSE PREVENTION) ─────────────────────────────
-- Cryptographic hash registry of normalized email identities that have claimed
-- an introductory 72-hour trial. Prevents multiple trials via repeated account creation.

CREATE TABLE IF NOT EXISTS public.teacher_trial_claims (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email_hash TEXT        NOT NULL UNIQUE,
  user_id               UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id             UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  claimed_at            TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE  public.teacher_trial_claims IS 'Audit registry of SHA-256 email hashes for claimed 72-hour introductory trials.';
COMMENT ON COLUMN public.teacher_trial_claims.normalized_email_hash IS 'SHA-256 digest of lower(trim(email)) to prevent duplicate trial issuance.';

CREATE INDEX IF NOT EXISTS idx_trial_claims_email_hash
  ON public.teacher_trial_claims (normalized_email_hash);

ALTER TABLE public.teacher_trial_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trial_claims_select_self"
  ON public.teacher_trial_claims
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_admin()
  );

CREATE POLICY "trial_claims_manage_platform_admin"
  ON public.teacher_trial_claims
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── 3. SERVER-SIDE ACTIVE SUBSCRIPTION EVALUATION ──────────────────────────
-- Considers a tenant subscription active if:
--   a) Status is 'active' AND current_period_end > clock_timestamp(), OR
--   b) Status is 'trialing' AND trial_ends_at > clock_timestamp()
-- Both require the tenant itself to have is_active = true.
-- Uses clock_timestamp() to eliminate transaction-start timestamp frozen values.

CREATE OR REPLACE FUNCTION public.is_tenant_subscription_active(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_subscriptions ts
    JOIN public.tenants t ON t.id = ts.tenant_id
    WHERE ts.tenant_id = p_tenant_id
      AND t.is_active = true
      AND (
        (ts.status = 'active' AND ts.current_period_end > clock_timestamp())
        OR
        (ts.status = 'trialing' AND ts.trial_ends_at > clock_timestamp())
      )
  );
$$;

ALTER FUNCTION public.is_tenant_subscription_active(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_tenant_subscription_active(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_subscription_active(UUID) TO authenticated, service_role;

-- ─── 4. ENFORCE ACTIVE SUBSCRIPTION ON STUDENT ENROLLMENTS ──────────────────
-- Updates student quota trigger to honor 72-hour trial validity via is_tenant_subscription_active.

CREATE OR REPLACE FUNCTION public.enforce_tenant_student_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub RECORD;
  v_current_distinct_students INTEGER;
  v_effective_limit INTEGER;
  v_is_already_enrolled BOOLEAN;
  v_is_active BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.student_id = NEW.student_id AND OLD.tenant_id = NEW.tenant_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT ts.status, ts.current_period_end, ts.trial_ends_at, ts.custom_student_limit, sp.max_students
  INTO v_sub
  FROM public.tenant_subscriptions ts
  JOIN public.subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = NEW.tenant_id
  FOR UPDATE OF ts;

  IF v_sub.status IS NULL THEN
    RAISE EXCEPTION 'Cannot enroll student: No subscription record found for workspace.'
      USING ERRCODE = '55000';
  END IF;

  SELECT public.is_tenant_subscription_active(NEW.tenant_id) INTO v_is_active;

  IF NOT v_is_active THEN
    RAISE EXCEPTION 'Cannot enroll student: Workspace subscription or trial is expired (Status: %). Active subscription required.',
      v_sub.status
      USING ERRCODE = '55000';
  END IF;

  v_effective_limit := COALESCE(v_sub.custom_student_limit, v_sub.max_students);

  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments
    WHERE tenant_id = NEW.tenant_id
      AND student_id = NEW.student_id
      AND (TG_OP = 'INSERT' OR NOT (student_id = OLD.student_id AND batch_id = OLD.batch_id))
  ) INTO v_is_already_enrolled;

  IF v_is_already_enrolled THEN
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT student_id) INTO v_current_distinct_students
  FROM public.enrollments
  WHERE tenant_id = NEW.tenant_id
    AND (TG_OP = 'INSERT' OR NOT (student_id = OLD.student_id AND batch_id = OLD.batch_id));

  IF v_current_distinct_students >= v_effective_limit THEN
    RAISE EXCEPTION 'Student quota reached (Limit: %, Current: %). Please upgrade your subscription tier.',
      v_effective_limit, v_current_distinct_students
      USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_tenant_student_quota() OWNER TO postgres;

-- ─── 5. UPDATED TENANT QUOTA SUMMARY FUNCTION ───────────────────────────────
-- Returns complete trial countdown and subscription information for the UI & Server Actions.

DROP FUNCTION IF EXISTS public.get_tenant_quota_summary(UUID);

CREATE OR REPLACE FUNCTION public.get_tenant_quota_summary(p_tenant_id UUID)
RETURNS TABLE (
  subscription_status     TEXT,
  is_active               BOOLEAN,
  is_trial                BOOLEAN,
  trial_ends_at           TIMESTAMPTZ,
  trial_remaining_seconds BIGINT,
  plan_code               TEXT,
  plan_name               TEXT,
  billing_cycle           TEXT,
  current_period_end      TIMESTAMPTZ,
  max_students            INTEGER,
  active_students         BIGINT,
  max_storage_bytes       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.status AS subscription_status,
    (
      t.is_active = true AND (
        (ts.status = 'active' AND ts.current_period_end > clock_timestamp()) OR
        (ts.status = 'trialing' AND ts.trial_ends_at > clock_timestamp())
      )
    ) AS is_active,
    (ts.status = 'trialing' AND ts.trial_ends_at > clock_timestamp()) AS is_trial,
    ts.trial_ends_at,
    CASE
      WHEN ts.status = 'trialing' AND ts.trial_ends_at > clock_timestamp()
      THEN GREATEST(0, EXTRACT(EPOCH FROM (ts.trial_ends_at - clock_timestamp()))::BIGINT)
      ELSE 0::BIGINT
    END AS trial_remaining_seconds,
    sp.code AS plan_code,
    sp.name AS plan_name,
    ts.billing_cycle,
    ts.current_period_end,
    COALESCE(ts.custom_student_limit, sp.max_students) AS max_students,
    (SELECT count(DISTINCT e.student_id) FROM public.enrollments e WHERE e.tenant_id = p_tenant_id) AS active_students,
    COALESCE(ts.custom_storage_limit_bytes, sp.max_storage_bytes) AS max_storage_bytes
  FROM public.tenants t
  LEFT JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
  LEFT JOIN public.subscription_plans sp   ON sp.id = ts.plan_id
  WHERE t.id = p_tenant_id;
END;
$$;

ALTER FUNCTION public.get_tenant_quota_summary(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_tenant_quota_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_quota_summary(UUID) TO authenticated, service_role;

-- ─── 6. PLATFORM ADMIN PAYMENT VERIFICATION PROCEDURE ───────────────────────
-- Updates payment approval/rejection logic:
--   - Approval starts subscription period from clock_timestamp() if previously trialing/expired
--   - Rejection explicitly sets tenant subscription status to 'expired'

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
  v_admin_id UUID;
  v_payment RECORD;
  v_sub RECORD;
  v_days_to_add INTEGER;
  v_new_period_end TIMESTAMPTZ;
  v_base_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
BEGIN
  v_admin_id := (SELECT auth.uid());
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied. Platform administrator credentials required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment is already processed (Status: %).', v_payment.status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sub
  FROM public.tenant_subscriptions
  WHERE id = v_payment.subscription_id;

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
REVOKE EXECUTE ON FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) TO authenticated, service_role;
