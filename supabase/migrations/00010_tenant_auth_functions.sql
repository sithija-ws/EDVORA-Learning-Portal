-- ============================================================================
-- Migration: 00010_tenant_auth_functions.sql
-- Description: Security Definer helper functions for multi-tenant authorization,
--              role hierarchy evaluation, and atomic tenant administration.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. GET ALL TENANT IDS FOR CALLER ────────────────────────────────────────
-- Returns all active tenant IDs where the authenticated user is an active staff member.

CREATE OR REPLACE FUNCTION public.get_auth_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.user_id = (SELECT auth.uid())
    AND t.is_active = true
    AND p.is_active = true;
$$;

ALTER FUNCTION public.get_auth_tenant_ids() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_auth_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_ids() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_auth_tenant_ids() IS
  'Returns all active tenant workspace IDs where the calling user is a verified staff member.';

-- ─── 2. GET CALLER ROLE IN SPECIFIC TENANT ───────────────────────────────────
-- Returns the role string ('owner', 'admin', 'instructor', 'assistant') or NULL.

CREATE OR REPLACE FUNCTION public.get_my_tenant_role(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tm.role
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id = (SELECT auth.uid())
    AND t.is_active = true
    AND p.is_active = true
  LIMIT 1;
$$;

ALTER FUNCTION public.get_my_tenant_role(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_my_tenant_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_role(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_tenant_role(UUID) IS
  'Returns caller role in given workspace, verifying active tenant and profile status.';

-- ─── 3. HIERARCHICAL TENANT ROLE CHECK ───────────────────────────────────────
-- Hierarchy: owner (40) > admin (30) > instructor (20) > assistant (10).
-- Returns true if the caller possesses equal or higher role privileges.

CREATE OR REPLACE FUNCTION public.has_tenant_role(p_tenant_id UUID, p_required_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_role TEXT;
  v_user_level INTEGER;
  v_required_level INTEGER;
BEGIN
  -- Fast return if tenant_id is NULL
  IF p_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Map required role to privilege level
  v_required_level := CASE lower(trim(p_required_role))
    WHEN 'owner'      THEN 40
    WHEN 'admin'      THEN 30
    WHEN 'instructor' THEN 20
    WHEN 'assistant'  THEN 10
    ELSE 999 -- Unknown role, deny by default
  END;

  IF v_required_level = 999 THEN
    RETURN FALSE;
  END IF;

  -- Look up member role within active tenant and active user profile
  SELECT tm.role INTO v_user_role
  FROM public.tenant_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id = (SELECT auth.uid())
    AND t.is_active = true
    AND p.is_active = true
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  v_user_level := CASE v_user_role
    WHEN 'owner'      THEN 40
    WHEN 'admin'      THEN 30
    WHEN 'instructor' THEN 20
    WHEN 'assistant'  THEN 10
    ELSE 0
  END;

  RETURN v_user_level >= v_required_level;
END;
$$;

ALTER FUNCTION public.has_tenant_role(UUID, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_tenant_role(UUID, TEXT) IS
  'Evaluates hierarchical role permissions (owner > admin > instructor > assistant) for caller in tenant.';

-- ─── 4. IS CALLER ACTIVE ENROLLED STUDENT IN TENANT ──────────────────────────
-- Returns true if caller is an active student enrolled in any non-archived batch in the tenant.

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
    WHERE e.tenant_id = p_tenant_id
      AND e.student_id = (SELECT auth.uid())
      AND b.is_archived = false
      AND t.is_active = true
      AND p.is_active = true
      AND p.role = 'student'
  );
$$;

ALTER FUNCTION public.is_tenant_student(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_tenant_student(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_student(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_tenant_student(UUID) IS
  'Returns true if authenticated caller is an active student enrolled in non-archived batch in tenant.';

-- ─── 5. IS CALLER ENROLLED IN TENANT BATCH ──────────────────────────────────
-- Verifies caller enrollment in a specific batch within an active tenant.

CREATE OR REPLACE FUNCTION public.is_enrolled_in_tenant_batch(p_batch_id UUID)
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
    WHERE e.batch_id = p_batch_id
      AND e.student_id = (SELECT auth.uid())
      AND b.is_archived = false
      AND t.is_active = true
      AND p.is_active = true
  );
$$;

ALTER FUNCTION public.is_enrolled_in_tenant_batch(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_tenant_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_tenant_batch(UUID) TO authenticated, service_role;

-- ─── 6. ATOMIC TENANT WORKSPACE CREATION ────────────────────────────────────
-- Creates a new workspace and registers the creator as owner in a single transaction.

CREATE OR REPLACE FUNCTION public.create_tenant_workspace(
  p_name TEXT,
  p_slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_caller_active BOOLEAN;
  v_tenant_id UUID;
  v_normalized_slug TEXT;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a workspace.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify caller exists, is active, and is a teacher
  SELECT role, is_active INTO v_caller_role, v_caller_active
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role != 'teacher' THEN
    RAISE EXCEPTION 'Only verified teachers can create tuition workspaces.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_caller_active THEN
    RAISE EXCEPTION 'Account is deactivated.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate and normalize slug
  v_normalized_slug := lower(trim(p_slug));
  IF NOT (v_normalized_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$') THEN
    RAISE EXCEPTION 'Invalid slug. Must be 3-40 lowercase alphanumeric characters and hyphens.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_normalized_slug) THEN
    RAISE EXCEPTION 'Workspace slug "%" is already taken.', v_normalized_slug
      USING ERRCODE = '23505';
  END IF;

  -- Validate workspace name
  IF length(trim(p_name)) < 2 OR length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'Workspace name must be between 2 and 100 characters.'
      USING ERRCODE = '22023';
  END IF;

  -- Insert tenant record
  INSERT INTO public.tenants (name, slug, owner_id)
  VALUES (trim(p_name), v_normalized_slug, v_caller_id)
  RETURNING id INTO v_tenant_id;

  -- Insert owner membership
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_caller_id, 'owner');

  RETURN v_tenant_id;
END;
$$;

ALTER FUNCTION public.create_tenant_workspace(TEXT, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.create_tenant_workspace(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_workspace(TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_tenant_workspace(TEXT, TEXT) IS
  'Atomically provisions a new tenant workspace and assigns calling teacher as owner.';

-- ─── 7. ATOMIC WORKSPACE OWNERSHIP TRANSFER ──────────────────────────────────
-- Safely reassigns owner role to an existing staff member and demotes previous owner to admin.

CREATE OR REPLACE FUNCTION public.transfer_tenant_ownership(
  p_tenant_id UUID,
  p_new_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_current_owner_id UUID;
  v_new_owner_role TEXT;
  v_new_owner_active BOOLEAN;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = 'P0001';
  END IF;

  -- Verify current ownership
  SELECT owner_id INTO v_current_owner_id
  FROM public.tenants
  WHERE id = p_tenant_id AND is_active = true;

  IF v_current_owner_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found or inactive.' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_owner_id != v_caller_id THEN
    RAISE EXCEPTION 'Only the current workspace owner can transfer ownership.'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_id = v_caller_id THEN
    RAISE EXCEPTION 'You are already the owner of this workspace.'
      USING ERRCODE = '22023';
  END IF;

  -- Verify target user is active member of this tenant
  SELECT tm.role, p.is_active INTO v_new_owner_role, v_new_owner_active
  FROM public.tenant_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id = p_new_owner_id;

  IF v_new_owner_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this workspace.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_new_owner_active THEN
    RAISE EXCEPTION 'Target user account is deactivated.'
      USING ERRCODE = '42501';
  END IF;

  -- Update tenant owner
  UPDATE public.tenants
  SET owner_id = p_new_owner_id,
      updated_at = now()
  WHERE id = p_tenant_id;

  -- Promote target user to owner
  UPDATE public.tenant_members
  SET role = 'owner',
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = p_new_owner_id;

  -- Demote previous owner to admin
  UPDATE public.tenant_members
  SET role = 'admin',
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND user_id = v_caller_id;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.transfer_tenant_ownership(UUID, UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.transfer_tenant_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_tenant_ownership(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.transfer_tenant_ownership(UUID, UUID) IS
  'Atomically transfers workspace ownership to an active member and demotes caller to admin.';
