-- ============================================================================
-- Migration: 00007_create_tenant_infrastructure.sql
-- Description: Multi-tenant core infrastructure — tenants, tenant_members, and
--              student_identities mapping tables with integrity triggers.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. TENANTS TABLE ────────────────────────────────────────────────────────
-- Represents independent tuition workspaces owned by teachers.

CREATE TABLE IF NOT EXISTS public.tenants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  owner_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  plan         TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  max_students INTEGER     NOT NULL DEFAULT 25 CHECK (max_students >= 1),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenants_slug UNIQUE (slug),
  CONSTRAINT chk_tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
);

COMMENT ON TABLE  public.tenants              IS 'Multi-tenant tuition workspaces.';
COMMENT ON COLUMN public.tenants.slug         IS 'Immutable or controlled URL slug (lowercase alphanumeric and hyphens).';
COMMENT ON COLUMN public.tenants.owner_id     IS 'Primary owner profile for the workspace.';
COMMENT ON COLUMN public.tenants.plan         IS 'Subscription tier governing quotas and features.';
COMMENT ON COLUMN public.tenants.max_students IS 'Maximum active student enrollments allowed under the tier.';

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants (owner_id);

-- ─── 2. TENANT MEMBERS TABLE ────────────────────────────────────────────────
-- Associates staff, instructors, admins, and owners with a workspace.

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'instructor'
             CHECK (role IN ('owner', 'admin', 'instructor', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_members_tenant_user UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE  public.tenant_members           IS 'Associates teachers and staff with authorized tenant workspaces.';
COMMENT ON COLUMN public.tenant_members.role      IS 'Workspace permission level: owner, admin, instructor, assistant.';

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members (user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_role ON public.tenant_members (tenant_id, role);

-- ─── 3. STUDENT IDENTITIES TABLE ────────────────────────────────────────────
-- Scopes human usernames to a tenant, mapping to an immutable Supabase Auth email.

CREATE TABLE IF NOT EXISTS public.student_identities (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username   TEXT        NOT NULL,
  auth_email TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_student_identity_tenant_username UNIQUE (tenant_id, username),
  CONSTRAINT uq_student_identity_tenant_student UNIQUE (tenant_id, student_id)
);

COMMENT ON TABLE  public.student_identities            IS 'Tenant-scoped student username mapping to Supabase Auth emails.';
COMMENT ON COLUMN public.student_identities.username   IS 'Human-friendly student username, unique per tenant.';
COMMENT ON COLUMN public.student_identities.auth_email IS 'Globally unique Supabase Auth email identifier.';

-- Case-insensitive username uniqueness index within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_student_identities_lower_username
  ON public.student_identities (tenant_id, lower(username));

CREATE INDEX IF NOT EXISTS idx_student_identities_lookup
  ON public.student_identities (tenant_id, lower(username));
CREATE INDEX IF NOT EXISTS idx_student_identities_student
  ON public.student_identities (student_id);
CREATE INDEX IF NOT EXISTS idx_student_identities_auth_email
  ON public.student_identities (auth_email);

-- ─── 4. UPDATED_AT TRIGGERS ─────────────────────────────────────────────────

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tenant_members_updated_at
  BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER student_identities_updated_at
  BEFORE UPDATE ON public.student_identities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5. MEMBER SAFETY & ROLE ELEVATION PROTECTION ───────────────────────────
-- Enforces:
-- 1. Last owner of a workspace cannot be removed or demoted.
-- 2. Non-owners cannot elevate anyone (or themselves) to owner.
-- 3. Ordinary members cannot modify their own roles.

CREATE OR REPLACE FUNCTION public.check_tenant_member_safety()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_count INTEGER;
  v_caller_id   UUID;
  v_caller_role TEXT;
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- Retrieve caller role if authenticated
  IF v_caller_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.tenant_members
    WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      AND user_id = v_caller_id;
  END IF;

  -- 1. INSERT CHECKS
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.tenant_members
      WHERE tenant_id = NEW.tenant_id AND role = 'owner';

      -- Allow first owner during workspace creation, otherwise require caller to be existing owner
      IF v_owner_count > 0 AND v_caller_id IS NOT NULL AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Only existing workspace owners can appoint additional owners.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- 2. DELETE CHECKS
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.tenant_members
      WHERE tenant_id = OLD.tenant_id AND role = 'owner' AND id != OLD.id;

      IF v_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last owner of a workspace.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- 3. UPDATE CHECKS
  IF TG_OP = 'UPDATE' THEN
    -- Prevent self-role modification for non-owners
    IF v_caller_id IS NOT NULL AND OLD.user_id = v_caller_id AND OLD.role != NEW.role AND OLD.role != 'owner' THEN
      RAISE EXCEPTION 'Members cannot modify their own roles.'
        USING ERRCODE = '42501';
    END IF;

    -- Demoting an owner
    IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.tenant_members
      WHERE tenant_id = OLD.tenant_id AND role = 'owner' AND id != OLD.id;

      IF v_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last owner of a workspace.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Promoting someone to owner
    IF OLD.role != 'owner' AND NEW.role = 'owner' THEN
      IF v_caller_id IS NOT NULL AND v_caller_role != 'owner' THEN
        RAISE EXCEPTION 'Only current workspace owners can promote members to owner.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenant_member_safety
  BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.check_tenant_member_safety();

-- ─── 6. TENANT SLUG IMMUTABILITY TRIGGER ────────────────────────────────────
-- Protects workspace slugs from mutation to ensure persistent URLs & mappings.

CREATE OR REPLACE FUNCTION public.protect_tenant_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.slug != NEW.slug THEN
    RAISE EXCEPTION 'Tenant workspace slug is immutable and cannot be changed.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_tenant_slug
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.protect_tenant_slug();
