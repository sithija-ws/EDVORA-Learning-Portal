-- ============================================================================
-- Migration: 00015_student_workspace_active_status.sql
-- Description: Adds is_active status to student_identities to enable workspace-scoped
--              student activation and deactivation without mutating global profiles.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. ADD IS_ACTIVE TO STUDENT_IDENTITIES ─────────────────────────────────

ALTER TABLE public.student_identities
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.student_identities.is_active IS
  'Workspace-scoped student activation flag. Allows independent suspension per tuition workspace.';

CREATE INDEX IF NOT EXISTS idx_student_identities_tenant_active
  ON public.student_identities (tenant_id, is_active);

-- ─── 2. UPDATE IS_TENANT_STUDENT TO ENFORCE WORKSPACE ACTIVE STATUS ─────────

CREATE OR REPLACE FUNCTION public.is_tenant_student(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.batches b ON b.id = e.batch_id
    JOIN public.tenants t ON t.id = e.tenant_id
    JOIN public.profiles p ON p.id = e.student_id
    JOIN public.student_identities si ON (si.tenant_id = e.tenant_id AND si.student_id = e.student_id)
    WHERE e.tenant_id = p_tenant_id
      AND e.student_id = (SELECT auth.uid())
      AND b.is_archived = false
      AND t.is_active = true
      AND p.is_active = true
      AND p.role = 'student'
      AND si.is_active = true
  );
$$;

ALTER FUNCTION public.is_tenant_student(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_tenant_student(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_student(UUID) TO authenticated, service_role;
