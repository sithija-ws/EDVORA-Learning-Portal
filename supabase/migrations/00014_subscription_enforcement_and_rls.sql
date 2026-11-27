-- ============================================================================
-- Migration: 00014_subscription_enforcement_and_rls.sql
-- Description: Server-side quota enforcement triggers, active subscription
--              checks on resource mutations, and platform admin overrides.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. STUDENT QUOTA ENFORCEMENT TRIGGER ───────────────────────────────────
-- Enforces that a tenant cannot enroll more unique students than permitted by
-- their active subscription plan or custom administrator override.
-- Serializes concurrent enrollments per-tenant using a row-level lock on the
-- tenant_subscriptions record to eliminate TOCTOU race conditions.

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
BEGIN
  -- If updating enrollment and student/tenant identities have not changed, skip check
  IF TG_OP = 'UPDATE' THEN
    IF OLD.student_id = NEW.student_id AND OLD.tenant_id = NEW.tenant_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 1. Acquire row-level exclusive lock on the tenant subscription row.
  -- This serializes concurrent enrollments for THIS tenant, preventing over-enrollment.
  -- Distinct tenants operate concurrently without blocking each other.
  SELECT ts.status, ts.current_period_end, ts.custom_student_limit, sp.max_students
  INTO v_sub
  FROM public.tenant_subscriptions ts
  JOIN public.subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = NEW.tenant_id
  FOR UPDATE OF ts;

  IF v_sub.status IS NULL THEN
    RAISE EXCEPTION 'Cannot enroll student: No subscription record found for workspace.'
      USING ERRCODE = '55000';
  END IF;

  IF v_sub.status != 'active' OR v_sub.current_period_end <= now() THEN
    RAISE EXCEPTION 'Cannot enroll student: Workspace subscription is not active (Status: %). Active subscription required.',
      v_sub.status
      USING ERRCODE = '55000';
  END IF;

  v_effective_limit := COALESCE(v_sub.custom_student_limit, v_sub.max_students);

  -- 2. Check if this student is already enrolled in another batch within the same tenant
  -- Multiple batch enrollments of the same student do NOT consume additional student slots.
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

  -- 3. Calculate current unique enrolled students in this tenant under the row lock
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

DROP TRIGGER IF EXISTS trg_check_student_quota ON public.enrollments;
CREATE TRIGGER trg_check_student_quota
  BEFORE INSERT OR UPDATE OF student_id, tenant_id ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_student_quota();

-- ─── 2. ACTIVE SUBSCRIPTION ENFORCEMENT ON CONTENT MUTATIONS ────────────────
-- Prevents creating or modifying batches, lessons, notes, and announcements
-- when a workspace subscription is expired, pending, or suspended.

CREATE OR REPLACE FUNCTION public.enforce_active_subscription_for_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub_active BOOLEAN;
  v_target_tenant_id UUID;
BEGIN
  v_target_tenant_id := NEW.tenant_id;

  -- Allow platform admins to bypass for maintenance
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  SELECT public.is_tenant_subscription_active(v_target_tenant_id) INTO v_sub_active;

  IF NOT v_sub_active THEN
    RAISE EXCEPTION 'Workspace subscription is expired, suspended, or pending verification. Mutations are restricted.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_active_subscription_for_mutations() OWNER TO postgres;

CREATE TRIGGER trg_sub_active_batches
  BEFORE INSERT OR UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_for_mutations();

CREATE TRIGGER trg_sub_active_lessons
  BEFORE INSERT OR UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_for_mutations();

CREATE TRIGGER trg_sub_active_notes
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_for_mutations();

CREATE TRIGGER trg_sub_active_announcements
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_subscription_for_mutations();
