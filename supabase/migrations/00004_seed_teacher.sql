-- ============================================================
-- Migration: 00004_seed_teacher.sql
-- Description: Seed the single teacher account (Legacy Single-Teacher MVP)
--
-- NOTE (SaaS Phase 3B/3C Migration Remediation):
--   In the initial single-teacher MVP, this script required manually
--   pasting a teacher UUID from the Supabase Auth dashboard.
--   Under the modern multi-tenant SaaS architecture (Phase 3B2-C),
--   teachers register dynamically through the application onboarding flow
--   (/register -> actions/auth.ts:registerTeacher()), and workspaces are
--   provisioned atomically via public.provision_tenant_workspace().
--
--   For fresh database environments (such as staging/production),
--   hardcoded teacher seeding is safely skipped.
--   Existing development databases remain unaffected as this migration
--   is already recorded in migration history.
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE
    'Migration 00004: Legacy teacher seed skipped. Teachers register through the application.';
END $$;
