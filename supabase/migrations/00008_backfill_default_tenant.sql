-- ============================================================================
-- Migration: 00008_backfill_default_tenant.sql
-- Description: Creates the default workspace for the existing teacher and maps
--              all existing student accounts into student_identities.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

DO $$
DECLARE
  v_teacher_id UUID;
  v_teacher_count INTEGER := 0;
  v_tenant_id  UUID;
  v_student_count INTEGER := 0;
  v_unlinked_profile_count INTEGER := 0;
BEGIN
  -- 1. Identify primary and secondary teachers
  SELECT count(*) INTO v_teacher_count
  FROM public.profiles
  WHERE role = 'teacher';

  IF v_teacher_count = 0 THEN
    RAISE NOTICE 'Migration 00008: No existing teacher profile found. Skipping legacy workspace backfill.';
    RETURN;
  END IF;

  SELECT id INTO v_teacher_id
  FROM public.profiles
  WHERE role = 'teacher'
  ORDER BY created_at ASC
  LIMIT 1;

  -- 2. Create the legacy primary workspace if it doesn't already exist
  INSERT INTO public.tenants (name, slug, owner_id, plan, max_students, is_active)
  VALUES ('Primary Tuition Workspace', 'default-workspace', v_teacher_id, 'pro', 1000, true)
  ON CONFLICT (slug) DO UPDATE
    SET owner_id = EXCLUDED.owner_id
  RETURNING id INTO v_tenant_id;

  -- 3. Assign primary teacher as workspace owner
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, v_teacher_id, 'owner')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'owner';

  -- If secondary teachers exist, register them as instructors in the default workspace
  IF v_teacher_count > 1 THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    SELECT v_tenant_id, p.id, 'instructor'
    FROM public.profiles p
    WHERE p.role = 'teacher' AND p.id != v_teacher_id
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    RAISE NOTICE 'Migration 00008: Associated % secondary teacher(s) as instructors in default workspace.', (v_teacher_count - 1);
  END IF;

  -- 4. Check for student profiles lacking matching auth.users records
  SELECT count(*) INTO v_unlinked_profile_count
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'student' AND u.id IS NULL;

  IF v_unlinked_profile_count > 0 THEN
    RAISE NOTICE 'Migration 00008: Found % student profile(s) without matching auth.users records. Mapping with synthetic recovery identities.', v_unlinked_profile_count;
  END IF;

  -- 5. Backfill student identities from profiles and auth.users with collision-free ranking
  WITH student_candidates AS (
    SELECT
      p.id AS student_id,
      u.email AS auth_user_email,
      COALESCE(
        NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
        NULLIF(trim(split_part(u.email, '@', 1)), ''),
        'student_' || substr(p.id::text, 1, 8)
      ) AS raw_username,
      ROW_NUMBER() OVER (
        PARTITION BY lower(COALESCE(
          NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
          NULLIF(trim(split_part(u.email, '@', 1)), ''),
          'student_' || substr(p.id::text, 1, 8)
        ))
        ORDER BY p.created_at ASC, p.id ASC
      ) AS disambiguation_rank
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'student'
  )
  INSERT INTO public.student_identities (tenant_id, student_id, username, auth_email)
  SELECT
    v_tenant_id,
    sc.student_id,
    CASE
      WHEN sc.disambiguation_rank = 1 THEN sc.raw_username
      ELSE sc.raw_username || '_' || substr(sc.student_id::text, 1, 4)
    END AS username,
    COALESCE(sc.auth_user_email, 'student_' || sc.student_id::text || '@edvora.internal') AS auth_email
  FROM student_candidates sc
  ON CONFLICT (tenant_id, student_id) DO NOTHING;

  GET DIAGNOSTICS v_student_count = ROW_COUNT;
  RAISE NOTICE 'Migration 00008: Successfully mapped % legacy student(s) to tenant %', v_student_count, v_tenant_id;
END $$;
