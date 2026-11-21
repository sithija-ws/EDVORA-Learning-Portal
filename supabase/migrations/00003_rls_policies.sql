-- ============================================================
-- Migration: 00003_rls_policies.sql
-- Description: Row Level Security policies for all tables
--
-- Security model:
--   - Teacher: full CRUD on all tables (identified by role = 'teacher' in profiles)
--   - Student: read-only access, scoped strictly to their batch
--   - Service role key (used in Server Actions): bypasses RLS entirely
--
-- Helper functions are defined first so policies can reference them.
-- ============================================================

-- ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

-- Returns the role of the authenticated user ('teacher' or 'student')
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Returns the batch_id of the authenticated student (NULL for teacher)
CREATE OR REPLACE FUNCTION public.get_my_batch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT batch_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Returns true if the authenticated user is the teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_role() = 'teacher';
$$;

-- ─── POLICIES: profiles ───────────────────────────────────────────────────────

-- Teacher: full access to all profiles (create, read, update — not delete for safety)
CREATE POLICY "teacher_full_profiles"
  ON public.profiles FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Student: can only read their own profile row
CREATE POLICY "student_own_profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id AND NOT is_teacher());

-- ─── POLICIES: batches ────────────────────────────────────────────────────────

-- Teacher: full CRUD on all batches
CREATE POLICY "teacher_full_batches"
  ON public.batches FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Student: read-only access to their own batch (must not be archived)
CREATE POLICY "student_own_batch"
  ON public.batches FOR SELECT
  USING (
    id = get_my_batch_id()
    AND is_archived = false
    AND NOT is_teacher()
  );

-- ─── POLICIES: lessons ────────────────────────────────────────────────────────

-- Teacher: full CRUD on all lessons
CREATE POLICY "teacher_full_lessons"
  ON public.lessons FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Student: read-only, only lessons assigned to their batch
CREATE POLICY "student_batch_lessons"
  ON public.lessons FOR SELECT
  USING (
    NOT is_teacher()
    AND EXISTS (
      SELECT 1 FROM public.lesson_batches lb
      WHERE lb.lesson_id = lessons.id
        AND lb.batch_id = get_my_batch_id()
    )
  );

-- ─── POLICIES: lesson_batches ─────────────────────────────────────────────────

-- Teacher: full CRUD
CREATE POLICY "teacher_full_lesson_batches"
  ON public.lesson_batches FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Student: read-only, only their batch assignments
CREATE POLICY "student_lesson_batches"
  ON public.lesson_batches FOR SELECT
  USING (
    NOT is_teacher()
    AND batch_id = get_my_batch_id()
  );

-- ─── POLICIES: announcements ──────────────────────────────────────────────────

-- Teacher: full CRUD
CREATE POLICY "teacher_full_announcements"
  ON public.announcements FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Student: read-only
-- Sees an announcement if it is a broadcast OR targeted to their batch
CREATE POLICY "student_batch_announcements"
  ON public.announcements FOR SELECT
  USING (
    NOT is_teacher()
    AND (
      is_broadcast = true
      OR EXISTS (
        SELECT 1 FROM public.announcement_batches ab
        WHERE ab.announcement_id = announcements.id
          AND ab.batch_id = get_my_batch_id()
      )
    )
  );

-- ─── POLICIES: announcement_batches ──────────────────────────────────────────

-- Teacher: full CRUD
CREATE POLICY "teacher_full_ann_batches"
  ON public.announcement_batches FOR ALL
  USING (is_teacher())
  WITH CHECK (is_teacher());

-- Student: read-only, only their batch
CREATE POLICY "student_ann_batches"
  ON public.announcement_batches FOR SELECT
  USING (
    NOT is_teacher()
    AND batch_id = get_my_batch_id()
  );
