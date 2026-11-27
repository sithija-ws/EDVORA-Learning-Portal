-- ============================================================================
-- Migration: 00011_multi_tenant_rls_policies.sql
-- Description: Drop legacy single-teacher RLS policies and implement granular,
--              role-aware, tenant-isolated Row Level Security policies.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. ENABLE RLS ON CORE TENANT TABLES ────────────────────────────────────

ALTER TABLE public.tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_identities ENABLE ROW LEVEL SECURITY;

-- ─── 2. DROP OBSOLETE SINGLE-TEACHER POLICIES ───────────────────────────────

-- Profiles
DROP POLICY IF EXISTS "teacher_full_profiles"  ON public.profiles;
DROP POLICY IF EXISTS "student_own_profile"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_teacher_all"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_student_read"  ON public.profiles;

-- Batches
DROP POLICY IF EXISTS "teacher_full_batches"   ON public.batches;
DROP POLICY IF EXISTS "student_own_batch"      ON public.batches;
DROP POLICY IF EXISTS "batches_select_policy"  ON public.batches;
DROP POLICY IF EXISTS "batches_teacher_all"    ON public.batches;

-- Lessons
DROP POLICY IF EXISTS "teacher_full_lessons"   ON public.lessons;
DROP POLICY IF EXISTS "student_batch_lessons"  ON public.lessons;
DROP POLICY IF EXISTS "lessons_select_policy"  ON public.lessons;
DROP POLICY IF EXISTS "lessons_teacher_all"    ON public.lessons;

-- Lesson Batches
DROP POLICY IF EXISTS "teacher_full_lesson_batches"  ON public.lesson_batches;
DROP POLICY IF EXISTS "student_batch_lesson_batches" ON public.lesson_batches;
DROP POLICY IF EXISTS "lesson_batches_select_policy" ON public.lesson_batches;
DROP POLICY IF EXISTS "lesson_batches_teacher_all"   ON public.lesson_batches;

-- Notes & Note Batches
DROP POLICY IF EXISTS "teacher_all_notes"                  ON public.notes;
DROP POLICY IF EXISTS "student_select_enrolled_notes"      ON public.notes;
DROP POLICY IF EXISTS "teacher_all_note_batches"           ON public.note_batches;
DROP POLICY IF EXISTS "student_select_enrolled_note_batches" ON public.note_batches;

-- Announcements & Announcement Batches
DROP POLICY IF EXISTS "teacher_full_announcements"         ON public.announcements;
DROP POLICY IF EXISTS "student_batch_announcements"        ON public.announcements;
DROP POLICY IF EXISTS "announcements_select_policy"        ON public.announcements;
DROP POLICY IF EXISTS "announcements_teacher_all"          ON public.announcements;
DROP POLICY IF EXISTS "teacher_full_announcement_batches"  ON public.announcement_batches;
DROP POLICY IF EXISTS "student_batch_announcement_batches" ON public.announcement_batches;
DROP POLICY IF EXISTS "announcement_batches_select_policy" ON public.announcement_batches;
DROP POLICY IF EXISTS "announcement_batches_teacher_all"   ON public.announcement_batches;

-- Enrollments
DROP POLICY IF EXISTS "teacher_full_enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_teacher_all"  ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_student_read" ON public.enrollments;

-- ─── 3. POLICIES: TENANTS ───────────────────────────────────────────────────

CREATE POLICY "tenants_select_authorized"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT public.get_auth_tenant_ids())
    OR public.is_tenant_student(id)
  );

CREATE POLICY "tenants_update_owner"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(id, 'owner'))
  WITH CHECK (public.has_tenant_role(id, 'owner'));

CREATE POLICY "tenants_delete_owner"
  ON public.tenants
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(id, 'owner'));

-- ─── 4. POLICIES: TENANT_MEMBERS ────────────────────────────────────────────

CREATE POLICY "tenant_members_select_member"
  ON public.tenant_members
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT public.get_auth_tenant_ids()));

CREATE POLICY "tenant_members_insert_admin"
  ON public.tenant_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_tenant_role(tenant_id, 'admin')
    AND (
      -- Only existing owners can appoint new owners
      (role = 'owner' AND public.has_tenant_role(tenant_id, 'owner'))
      OR
      (role != 'owner' AND public.has_tenant_role(tenant_id, 'admin'))
    )
  );

CREATE POLICY "tenant_members_update_admin"
  ON public.tenant_members
  FOR UPDATE
  TO authenticated
  USING (
    -- Admins can update non-owner members, owners can update any member
    (public.has_tenant_role(tenant_id, 'owner'))
    OR
    (public.has_tenant_role(tenant_id, 'admin') AND role != 'owner' AND user_id != auth.uid())
  )
  WITH CHECK (
    -- Non-owners cannot promote to owner or modify their own role
    (public.has_tenant_role(tenant_id, 'owner'))
    OR
    (public.has_tenant_role(tenant_id, 'admin') AND role != 'owner' AND user_id != auth.uid())
  );

CREATE POLICY "tenant_members_delete_admin"
  ON public.tenant_members
  FOR DELETE
  TO authenticated
  USING (
    -- Owners can delete non-self members, admins can delete non-owner, non-self members
    (public.has_tenant_role(tenant_id, 'owner') AND user_id != auth.uid())
    OR
    (public.has_tenant_role(tenant_id, 'admin') AND role != 'owner' AND user_id != auth.uid())
  );

-- ─── 5. POLICIES: STUDENT_IDENTITIES ────────────────────────────────────────

CREATE POLICY "student_identities_select"
  ON public.student_identities
  FOR SELECT
  TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'assistant')
    OR student_id = auth.uid()
  );

CREATE POLICY "student_identities_insert_admin"
  ON public.student_identities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));

CREATE POLICY "student_identities_update_admin"
  ON public.student_identities
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));

CREATE POLICY "student_identities_delete_admin"
  ON public.student_identities
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'admin'));

-- ─── 6. POLICIES: BATCHES ───────────────────────────────────────────────────

CREATE POLICY "batches_select_staff"
  ON public.batches
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "batches_select_student"
  ON public.batches
  FOR SELECT
  TO authenticated
  USING (
    is_archived = false
    AND public.is_enrolled_in_tenant_batch(id)
  );

CREATE POLICY "batches_insert_instructor"
  ON public.batches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

CREATE POLICY "batches_update_instructor"
  ON public.batches
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

CREATE POLICY "batches_delete_admin"
  ON public.batches
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'admin'));

-- ─── 7. POLICIES: LESSONS ───────────────────────────────────────────────────

CREATE POLICY "lessons_select_staff"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "lessons_select_student"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_batches lb
      WHERE lb.lesson_id = lessons.id
        AND lb.tenant_id = lessons.tenant_id
        AND public.is_enrolled_in_tenant_batch(lb.batch_id)
    )
  );

CREATE POLICY "lessons_insert_instructor"
  ON public.lessons
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

CREATE POLICY "lessons_update_instructor"
  ON public.lessons
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

CREATE POLICY "lessons_delete_instructor"
  ON public.lessons
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'));

-- ─── 8. POLICIES: LESSON_BATCHES ────────────────────────────────────────────

CREATE POLICY "lesson_batches_select_staff"
  ON public.lesson_batches
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "lesson_batches_select_student"
  ON public.lesson_batches
  FOR SELECT
  TO authenticated
  USING (public.is_enrolled_in_tenant_batch(batch_id));

CREATE POLICY "lesson_batches_manage_instructor"
  ON public.lesson_batches
  FOR ALL
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

-- ─── 9. POLICIES: NOTES ─────────────────────────────────────────────────────

CREATE POLICY "notes_select_staff"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "notes_select_student"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.note_batches nb
      WHERE nb.note_id = notes.id
        AND nb.tenant_id = notes.tenant_id
        AND public.is_enrolled_in_tenant_batch(nb.batch_id)
    )
  );

CREATE POLICY "notes_insert_instructor"
  ON public.notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

CREATE POLICY "notes_update_instructor"
  ON public.notes
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

CREATE POLICY "notes_delete_instructor"
  ON public.notes
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'));

-- ─── 10. POLICIES: NOTE_BATCHES ─────────────────────────────────────────────

CREATE POLICY "note_batches_select_staff"
  ON public.note_batches
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "note_batches_select_student"
  ON public.note_batches
  FOR SELECT
  TO authenticated
  USING (public.is_enrolled_in_tenant_batch(batch_id));

CREATE POLICY "note_batches_manage_instructor"
  ON public.note_batches
  FOR ALL
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'instructor'));

-- ─── 11. POLICIES: ANNOUNCEMENTS ────────────────────────────────────────────

CREATE POLICY "announcements_select_staff"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "announcements_select_student"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    (
      -- Broadcast announcement (no batch assignments)
      NOT EXISTS (SELECT 1 FROM public.announcement_batches ab WHERE ab.announcement_id = announcements.id)
      AND public.is_tenant_student(announcements.tenant_id)
    )
    OR
    (
      -- Batch-scoped announcement
      EXISTS (
        SELECT 1 FROM public.announcement_batches ab
        WHERE ab.announcement_id = announcements.id
          AND ab.tenant_id = announcements.tenant_id
          AND public.is_enrolled_in_tenant_batch(ab.batch_id)
      )
    )
  );

CREATE POLICY "announcements_insert_assistant"
  ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "announcements_update_assistant"
  ON public.announcements
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "announcements_delete_instructor"
  ON public.announcements
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'instructor'));

-- ─── 12. POLICIES: ANNOUNCEMENT_BATCHES ──────────────────────────────────────

CREATE POLICY "announcement_batches_select_staff"
  ON public.announcement_batches
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "announcement_batches_select_student"
  ON public.announcement_batches
  FOR SELECT
  TO authenticated
  USING (public.is_enrolled_in_tenant_batch(batch_id));

CREATE POLICY "announcement_batches_manage_assistant"
  ON public.announcement_batches
  FOR ALL
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'assistant'));

-- ─── 13. POLICIES: ENROLLMENTS ──────────────────────────────────────────────

CREATE POLICY "enrollments_select_staff"
  ON public.enrollments
  FOR SELECT
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'assistant'));

CREATE POLICY "enrollments_select_student"
  ON public.enrollments
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "enrollments_insert_admin"
  ON public.enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));

CREATE POLICY "enrollments_update_admin"
  ON public.enrollments
  FOR UPDATE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'admin'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));

CREATE POLICY "enrollments_delete_admin"
  ON public.enrollments
  FOR DELETE
  TO authenticated
  USING (public.has_tenant_role(tenant_id, 'admin'));

-- ─── 14. POLICIES: PROFILES ─────────────────────────────────────────────────

CREATE POLICY "profiles_select_self"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_tenant_staff"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_identities si
      WHERE si.student_id = profiles.id
        AND si.tenant_id IN (SELECT public.get_auth_tenant_ids())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = profiles.id
        AND tm.tenant_id IN (SELECT public.get_auth_tenant_ids())
    )
  );

CREATE POLICY "profiles_update_self"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_tenant_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    role = 'student'
    AND EXISTS (
      SELECT 1 FROM public.student_identities si
      WHERE si.student_id = profiles.id
        AND public.has_tenant_role(si.tenant_id, 'admin')
    )
  )
  WITH CHECK (
    role = 'student'
    AND EXISTS (
      SELECT 1 FROM public.student_identities si
      WHERE si.student_id = profiles.id
        AND public.has_tenant_role(si.tenant_id, 'admin')
    )
  );

-- ─── 15. TABLE PERMISSIONS & GRANTS ─────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_identities TO authenticated, service_role;
