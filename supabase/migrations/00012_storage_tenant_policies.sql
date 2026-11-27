-- ============================================================================
-- Migration: 00012_storage_tenant_policies.sql
-- Description: Multi-tenant storage isolation policies for bucket 'notes'
--              enforcing folder path prefix {tenant_id}/* while preserving
--              read backwards compatibility for legacy un-prefixed files.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. SAFE UUID EXTRACTION HELPER ─────────────────────────────────────────
-- Safely parses a string into a UUID without throwing runtime cast exceptions.

CREATE OR REPLACE FUNCTION public.try_cast_uuid(p_text TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.try_cast_uuid(TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.try_cast_uuid(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_cast_uuid(TEXT) TO authenticated, service_role;

-- ─── 2. HARDEN BUCKET VISIBILITY & DROP OBSOLETE POLICIES ────────────────────
-- CRITICAL SECURITY FIX: Set bucket 'notes' to private (public = false).
-- When public = true, storage RLS is bypassed via direct CDN URL fetches.
-- Private bucket requires authenticated API downloads or signed URLs.

UPDATE storage.buckets
SET public = false
WHERE id = 'notes';

DROP POLICY IF EXISTS "teacher_upload_notes_storage"     ON storage.objects;
DROP POLICY IF EXISTS "teacher_manage_notes_storage"     ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_notes_storage" ON storage.objects;
DROP POLICY IF EXISTS "notes_storage_upload_tenant"      ON storage.objects;
DROP POLICY IF EXISTS "notes_storage_manage_tenant"      ON storage.objects;
DROP POLICY IF EXISTS "notes_storage_select_tenant"      ON storage.objects;

-- ─── 3. TENANT STORAGE UPLOAD POLICY (INSERT) ───────────────────────────────
-- Teachers / instructors can upload files only into their own tenant folder: {tenant_id}/*

CREATE POLICY "notes_storage_upload_tenant"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'notes'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'instructor')
  );

-- ─── 4. TENANT STORAGE MANAGE POLICY (UPDATE & DELETE) ──────────────────────
-- Instructors can update or delete objects strictly within their authorized tenant folder.

CREATE POLICY "notes_storage_manage_tenant"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'notes'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'instructor')
  )
  WITH CHECK (
    bucket_id = 'notes'
    AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
    AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'instructor')
  );

-- ─── 5. TENANT STORAGE READ POLICY (SELECT) ─────────────────────────────────
-- Reading allowed if:
-- 1) Legacy file without tenant prefix (backwards compatibility).
-- 2) Caller has staff role ('assistant' or higher) in the path tenant.
-- 3) Caller is an active enrolled student in the path tenant.

CREATE POLICY "notes_storage_select_tenant"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'notes'
    AND (
      -- Legacy compatibility: files stored at the root of bucket without folder prefix
      (split_part(name, '/', 2) = '' AND public.try_cast_uuid(name) IS NULL)
      OR
      -- Tenant-scoped files: verify caller belongs to tenant as staff or student
      (
        public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
        AND (
          public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'assistant')
          OR
          public.is_tenant_student(public.try_cast_uuid(split_part(name, '/', 1)))
        )
      )
    )
  );
