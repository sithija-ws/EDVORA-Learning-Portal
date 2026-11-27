-- ============================================================================
-- Migration: 00013_subscription_and_commercial_billing.sql
-- Description: Commercial SaaS subscription architecture — configurable plans,
--              tenant subscription lifecycle, manual payment verification,
--              audit history, and platform admin authorization.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. PLATFORM ADMINISTRATORS TABLE ───────────────────────────────────────
-- Dedicated registry of platform super-administrators authorized to manage
-- subscriptions, verify bank payments, and configure billing plans.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS 'System administrators with platform-wide billing and workspace oversight.';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_select_self"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Helper function to evaluate platform admin status
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    JOIN public.profiles p ON p.id = pa.user_id
    WHERE pa.user_id = (SELECT auth.uid())
      AND p.is_active = true
  );
$$;

ALTER FUNCTION public.is_platform_admin() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ─── 2. SUBSCRIPTION PLANS TABLE ────────────────────────────────────────────
-- Fully configurable plans with adjustable prices, student quotas, and storage.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT          NOT NULL UNIQUE,
  name               TEXT          NOT NULL,
  description        TEXT,
  price_lkr_monthly  NUMERIC(10,2) NOT NULL CHECK (price_lkr_monthly > 0),
  price_lkr_annual   NUMERIC(10,2) NULL CHECK (price_lkr_annual IS NULL OR price_lkr_annual > 0),
  max_students       INTEGER       NOT NULL CHECK (max_students >= 1),
  max_storage_bytes  BIGINT        NOT NULL DEFAULT 2147483648 CHECK (max_storage_bytes >= 1048576), -- Provisional placeholder (2GB)
  features           JSONB         NOT NULL DEFAULT '[]'::jsonb,
  is_active          BOOLEAN       NOT NULL DEFAULT true,
  sort_order         INTEGER       NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.subscription_plans IS 'Commercial pricing tiers and feature entitlements.';
COMMENT ON COLUMN public.subscription_plans.price_lkr_monthly IS 'Approved commercial monthly rate in Sri Lankan Rupees (LKR).';
COMMENT ON COLUMN public.subscription_plans.price_lkr_annual  IS 'Annual rate in LKR (NULL indicates annual billing is unfinalized).';
COMMENT ON COLUMN public.subscription_plans.max_students      IS 'Provisional active student cap (unfinalized; configurable by platform admin).';
COMMENT ON COLUMN public.subscription_plans.max_storage_bytes IS 'Provisional storage cap in bytes (unfinalized; configurable by platform admin).';

CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view active plans; only platform admins can modify
CREATE POLICY "plans_select_active"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_platform_admin());

CREATE POLICY "plans_manage_platform_admin"
  ON public.subscription_plans
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed initial configurable plans with approved monthly rates.
-- Annual pricing is NULL (unfinalized). Quotas are provisional placeholders.
-- ON CONFLICT (code) DO NOTHING guarantees administrator updates are never overwritten.
INSERT INTO public.subscription_plans (
  code, name, description, price_lkr_monthly, price_lkr_annual, max_students, max_storage_bytes, sort_order
) VALUES
  (
    'starter',
    'Starter Tuition',
    'Solo tuition teachers with individual batches.',
    2600.00,
    NULL,
    30,           -- Provisional placeholder; pending commercial finalization
    2147483648,   -- Provisional 2 GB; pending commercial finalization
    10
  ),
  (
    'growth',
    'Growth Tuition',
    'Established tuition teachers with expanding cohorts.',
    5000.00,
    NULL,
    100,          -- Provisional placeholder; pending commercial finalization
    10737418240,  -- Provisional 10 GB; pending commercial finalization
    20
  ),
  (
    'pro',
    'Professional Academy',
    'Tuition academies with multiple batches and staff assistants.',
    8000.00,
    NULL,
    300,          -- Provisional placeholder; pending commercial finalization
    53687091200,  -- Provisional 50 GB; pending commercial finalization
    30
  )
ON CONFLICT (code) DO NOTHING;

-- ─── 3. TENANT SUBSCRIPTIONS TABLE ──────────────────────────────────────────
-- Represents the binding between a workspace and its active commercial plan.

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id                    UUID        NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status                     TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'active', 'expired', 'suspended')),
  billing_cycle              TEXT        NOT NULL DEFAULT 'monthly'
                             CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start       TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end         TIMESTAMPTZ NOT NULL,
  cancel_at_period_end       BOOLEAN     NOT NULL DEFAULT false,
  custom_student_limit       INTEGER     CHECK (custom_student_limit IS NULL OR custom_student_limit >= 1),
  custom_storage_limit_bytes BIGINT      CHECK (custom_storage_limit_bytes IS NULL OR custom_storage_limit_bytes >= 1048576),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_subscription UNIQUE (tenant_id)
);

COMMENT ON TABLE  public.tenant_subscriptions        IS 'Commercial subscription state and billing period for each tenant.';
COMMENT ON COLUMN public.tenant_subscriptions.status IS 'Subscription lifecycle status: pending, active, expired, or suspended.';

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON public.tenant_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON public.tenant_subscriptions (status);

CREATE TRIGGER tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Staff can view their own tenant subscription; NO client can mutate subscriptions directly!
CREATE POLICY "tenant_subscriptions_select_staff"
  ON public.tenant_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_auth_tenant_ids())
    OR public.is_platform_admin()
  );

CREATE POLICY "tenant_subscriptions_manage_platform_admin"
  ON public.tenant_subscriptions
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── 4. SUBSCRIPTION PAYMENTS TABLE ─────────────────────────────────────────
-- Tracks payment receipts, manual bank transfer deposit slips, and future gateway charges.

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id  UUID          NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
  plan_id          UUID          NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  amount_lkr       NUMERIC(10,2) NOT NULL CHECK (amount_lkr > 0),
  billing_cycle    TEXT          NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  payment_method   TEXT          NOT NULL DEFAULT 'bank_transfer'
                   CHECK (payment_method IN ('bank_transfer', 'online_gateway', 'manual_cash')),
  status           TEXT          NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'verified', 'rejected', 'refunded')),
  reference_number TEXT,
  slip_url         TEXT,
  submitted_by     UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  verified_by      UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscription_payments IS 'Payment submissions, bank slip proofs, and verification logs.';

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON public.subscription_payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.subscription_payments (status);

CREATE TRIGGER subscription_payments_updated_at
  BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Tenant owner/admin can view their own payment submissions
CREATE POLICY "payments_select_tenant_admin"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'admin')
    OR public.is_platform_admin()
  );

-- Tenant owner/admin can submit a pending payment record with a slip
CREATE POLICY "payments_insert_tenant_admin"
  ON public.subscription_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_tenant_role(tenant_id, 'admin')
    AND status = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
    AND submitted_by = auth.uid()
  );

-- ONLY platform admins can verify or update payments
CREATE POLICY "payments_update_platform_admin"
  ON public.subscription_payments
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── 5. SUBSCRIPTION HISTORY AUDIT LOG ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL
              CHECK (event_type IN ('created', 'activated', 'renewed', 'plan_changed', 'expired', 'suspended', 'reinstated', 'limit_override')),
  old_status  TEXT,
  new_status  TEXT,
  old_plan_id UUID        REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  new_plan_id UUID        REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  actor_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_history_tenant ON public.subscription_history (tenant_id, created_at DESC);

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_history_select_staff"
  ON public.subscription_history
  FOR SELECT
  TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'admin')
    OR public.is_platform_admin()
  );

-- ─── 6. SERVER-SIDE SUBSCRIPTION AUTHORIZATION FUNCTIONS ────────────────────

-- Evaluates if a tenant has an active, unexpired subscription
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
      AND ts.status = 'active'
      AND ts.current_period_end > now()
      AND t.is_active = true
  );
$$;

ALTER FUNCTION public.is_tenant_subscription_active(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_tenant_subscription_active(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_subscription_active(UUID) TO authenticated, service_role;

-- Returns detailed subscription and quota info for server actions
CREATE OR REPLACE FUNCTION public.get_tenant_quota_summary(p_tenant_id UUID)
RETURNS TABLE (
  subscription_status TEXT,
  is_active           BOOLEAN,
  plan_code           TEXT,
  plan_name           TEXT,
  billing_cycle       TEXT,
  current_period_end  TIMESTAMPTZ,
  max_students        INTEGER,
  active_students     BIGINT,
  max_storage_bytes   BIGINT
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
    (ts.status = 'active' AND ts.current_period_end > now() AND t.is_active = true) AS is_active,
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

-- ─── 7. PLATFORM ADMIN VERIFICATION PROCEDURE ───────────────────────────────
-- Dedicated procedure for platform admins to verify bank transfer payments and extend subscriptions.

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

  IF p_approve THEN
    -- Calculate extension duration (defaults: 30 days monthly, 365 days annual)
    IF p_extension_days IS NOT NULL AND p_extension_days > 0 THEN
      v_days_to_add := p_extension_days;
    ELSE
      v_days_to_add := CASE v_payment.billing_cycle
        WHEN 'annual' THEN 365
        ELSE 30
      END;
    END IF;

    -- If subscription is currently active and not expired, extend from current end date
    IF v_sub.status = 'active' AND v_sub.current_period_end > now() THEN
      v_base_start := v_sub.current_period_end;
    ELSE
      v_base_start := now();
    END IF;

    v_new_period_end := v_base_start + (v_days_to_add || ' days')::interval;

    -- Update payment record
    UPDATE public.subscription_payments
    SET status = 'verified',
        verified_by = v_admin_id,
        verified_at = now(),
        updated_at = now()
    WHERE id = p_payment_id;

    -- Update subscription record
    UPDATE public.tenant_subscriptions
    SET status = 'active',
        plan_id = v_payment.plan_id,
        billing_cycle = v_payment.billing_cycle,
        current_period_start = CASE WHEN v_sub.status = 'active' THEN v_sub.current_period_start ELSE now() END,
        current_period_end = v_new_period_end,
        updated_at = now()
    WHERE id = v_sub.id;

    -- Record audit log
    INSERT INTO public.subscription_history (
      tenant_id, event_type, old_status, new_status, old_plan_id, new_plan_id, actor_id, notes
    ) VALUES (
      v_sub.tenant_id,
      'renewed',
      v_sub.status,
      'active',
      v_sub.plan_id,
      v_payment.plan_id,
      v_admin_id,
      'Payment verified via admin procedure. Extended until ' || v_new_period_end::text
    );
  ELSE
    -- Rejection
    UPDATE public.subscription_payments
    SET status = 'rejected',
        verified_by = v_admin_id,
        verified_at = now(),
        rejection_reason = p_rejection_reason,
        updated_at = now()
    WHERE id = p_payment_id;

    INSERT INTO public.subscription_history (
      tenant_id, event_type, old_status, new_status, actor_id, notes
    ) VALUES (
      v_sub.tenant_id,
      'plan_changed',
      v_sub.status,
      v_sub.status,
      v_admin_id,
      'Payment rejected: ' || COALESCE(p_rejection_reason, 'No reason provided')
    );
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER) TO authenticated, service_role;

-- ─── 8. BACKFILL DEFAULT TENANT SUBSCRIPTION ────────────────────────────────
-- Assign initial active subscription to legacy primary workspace

DO $$
DECLARE
  v_default_tenant_id UUID;
  v_starter_plan_id   UUID;
BEGIN
  SELECT id INTO v_default_tenant_id FROM public.tenants WHERE slug = 'default-workspace' LIMIT 1;
  SELECT id INTO v_starter_plan_id   FROM public.subscription_plans WHERE code = 'starter' LIMIT 1;

  IF v_default_tenant_id IS NOT NULL AND v_starter_plan_id IS NOT NULL THEN
    INSERT INTO public.tenant_subscriptions (
      tenant_id,
      plan_id,
      status,
      billing_cycle,
      current_period_start,
      current_period_end
    ) VALUES (
      v_default_tenant_id,
      v_starter_plan_id,
      'active',
      'monthly',
      now(),
      now() + interval '30 days'
    )
    ON CONFLICT (tenant_id) DO NOTHING;
  END IF;
END $$;
