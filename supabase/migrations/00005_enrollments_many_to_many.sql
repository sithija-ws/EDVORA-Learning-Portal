-- ============================================================================
-- Migration: 00005_enrollments_many_to_many.sql
-- Description: Transition student batch assignment from 1:N (profiles.batch_id)
--              to M:N (public.enrollments) with hardened RLS and helper functions.
-- ============================================================================

-- ─── 1. CREATE ENROLLMENTS JUNCTION TABLE ───────────────────────────────────
-- Many-to-many relationship allowing students to enroll in multiple batches.

CREATE TABLE public.enrollments (
  student_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  batch_id   UUID        NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, batch_id)
);

COMMENT ON TABLE  public.enrollments            IS 'Many-to-many junction table assigning students to batches.';
COMMENT ON COLUMN public.enrollments.student_id IS 'References the student profile.';
COMMENT ON COLUMN public.enrollments.batch_id   IS 'References the batch the student is enrolled in.';
COMMENT ON COLUMN public.enrollments.created_at IS 'Timestamp when the student was enrolled in the batch.';

-- ─── 2. DATA INTEGRITY AUDIT BEFORE BACKFILL ────────────────────────────────
-- Ensure no non-student profiles have an assigned batch_id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE batch_id IS NOT NULL AND role != 'student'
  ) THEN
    RAISE EXCEPTION 'Migration 00005 aborted: Found non-student profile with non-NULL batch_id';
  END IF;
END $$;

-- ─── 3. BACKFILL FROM PROFILES.BATCH_ID ─────────────────────────────────────
-- Migrate all existing 1:N student batch assignments into public.enrollments.

INSERT INTO public.enrollments (student_id, batch_id)
SELECT id, batch_id
FROM public.profiles
WHERE batch_id IS NOT NULL AND role = 'student'
ON CONFLICT (student_id, batch_id) DO NOTHING;

-- ─── 4. VERIFY BACKFILL COMPLETENESS ────────────────────────────────────────
-- Exact source-to-target pairwise anti-join verification.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.batch_id IS NOT NULL
      AND p.role = 'student'
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = p.id AND e.batch_id = p.batch_id
      )
  ) THEN
    RAISE EXCEPTION 'Migration 00005 aborted: Backfill verification failed. Mismatch between profiles.batch_id and enrollments';
  END IF;
END $$;

-- ─── 5. INDEXES ─────────────────────────────────────────────────────────────
-- PK already indexes (student_id, batch_id). Index batch_id for reverse lookups.

CREATE INDEX idx_enrollments_batch_id ON public.enrollments (batch_id);
CREATE INDEX idx_enrollments_student_id ON public.enrollments (student_id);

-- ─── 6. ENABLE ROW LEVEL SECURITY ───────────────────────────────────────────

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- ─── 7. HELPER FUNCTIONS (HARDENED SECURITY DEFINER) ─────────────────────────

-- Returns the role of the authenticated user ('teacher' or 'student')
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid());
$$;

ALTER FUNCTION public.get_my_role() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

-- Returns true if the authenticated user is an active teacher
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'teacher'
      AND p.is_active = true
  );
$$;

ALTER FUNCTION public.is_teacher() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_teacher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated, service_role;

-- Returns true if the authenticated user is an active student
CREATE OR REPLACE FUNCTION public.is_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'student'
      AND p.is_active = true
  );
$$;

ALTER FUNCTION public.is_student() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_student() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student() TO authenticated, service_role;

-- Returns true if the authenticated active student is enrolled in a non-archived batch
CREATE OR REPLACE FUNCTION public.is_enrolled_in_batch(p_batch_id UUID)
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
    JOIN public.profiles p ON p.id = e.student_id
    WHERE e.student_id = (SELECT auth.uid())
      AND e.batch_id = p_batch_id
      AND b.is_archived = false
      AND p.is_active = true
      AND p.role = 'student'
  );
$$;

ALTER FUNCTION public.is_enrolled_in_batch(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.is_enrolled_in_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_batch(UUID) TO authenticated, service_role;

-- ─── 8. REPLACE RLS POLICIES (EXPLICIT TARGET ROLES) ────────────────────────

-- [PROFILES]
DROP POLICY IF EXISTS "teacher_full_profiles" ON public.profiles;
DROP POLICY IF EXISTS "student_own_profile" ON public.profiles;

CREATE POLICY "teacher_full_profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- [ENROLLMENTS]
CREATE POLICY "teacher_full_enrollments"
  ON public.enrollments FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "student_select_enrollments"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (
    public.is_student()
    AND student_id = (SELECT auth.uid())
  );

-- [BATCHES]
DROP POLICY IF EXISTS "teacher_full_batches" ON public.batches;
DROP POLICY IF EXISTS "student_own_batch" ON public.batches;

CREATE POLICY "teacher_full_batches"
  ON public.batches FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "student_select_batches"
  ON public.batches FOR SELECT
  TO authenticated
  USING (
    public.is_student()
    AND is_archived = false
    AND public.is_enrolled_in_batch(id)
  );

-- [LESSONS]
DROP POLICY IF EXISTS "teacher_full_lessons" ON public.lessons;
DROP POLICY IF EXISTS "student_batch_lessons" ON public.lessons;

CREATE POLICY "teacher_full_lessons"
  ON public.lessons FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "student_select_lessons"
  ON public.lessons FOR SELECT
  TO authenticated
  USING (
    public.is_student()
    AND EXISTS (
      SELECT 1 FROM public.lesson_batches lb
      JOIN public.batches b ON b.id = lb.batch_id
      WHERE lb.lesson_id = lessons.id
        AND b.is_archived = false
        AND public.is_enrolled_in_batch(lb.batch_id)
    )
  );

-- [LESSON_BATCHES]
DROP POLICY IF EXISTS "teacher_full_lesson_batches" ON public.lesson_batches;
DROP POLICY IF EXISTS "student_lesson_batches" ON public.lesson_batches;

CREATE POLICY "teacher_full_lesson_batches"
  ON public.lesson_batches FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "student_select_lesson_batches"
  ON public.lesson_batches FOR SELECT
  TO authenticated
  USING (
    public.is_student()
    AND EXISTS (
      SELECT 1 FROM public.batches b
      WHERE b.id = lesson_batches.batch_id
        AND b.is_archived = false
        AND public.is_enrolled_in_batch(lesson_batches.batch_id)
    )
  );

-- [ANNOUNCEMENTS]
DROP POLICY IF EXISTS "teacher_full_announcements" ON public.announcements;
DROP POLICY IF EXISTS "student_batch_announcements" ON public.announcements;

CREATE POLICY "teacher_full_announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "student_select_announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    public.is_student()
    AND (
      is_broadcast = true
      OR EXISTS (
        SELECT 1 FROM public.announcement_batches ab
        JOIN public.batches b ON b.id = ab.batch_id
        WHERE ab.announcement_id = announcements.id
          AND b.is_archived = false
          AND public.is_enrolled_in_batch(ab.batch_id)
      )
    )
  );

-- [ANNOUNCEMENT_BATCHES]
DROP POLICY IF EXISTS "teacher_full_ann_batches" ON public.announcement_batches;
DROP POLICY IF EXISTS "student_ann_batches" ON public.announcement_batches;

CREATE POLICY "teacher_full_announcement_batches"
  ON public.announcement_batches FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY "student_select_announcement_batches"
  ON public.announcement_batches FOR SELECT
  TO authenticated
  USING (
    public.is_student()
    AND EXISTS (
      SELECT 1 FROM public.batches b
      WHERE b.id = announcement_batches.batch_id
        AND b.is_archived = false
        AND public.is_enrolled_in_batch(announcement_batches.batch_id)
    )
  );

-- ─── 9. REMOVE OBSOLETE SINGLE-BATCH OBJECTS ────────────────────────────────
-- Dependent policies have been safely replaced; obsolete objects can now be dropped.

DROP FUNCTION IF EXISTS public.get_my_batch_id();
DROP INDEX IF EXISTS public.idx_profiles_batch_id;
ALTER TABLE public.profiles DROP COLUMN batch_id;

-- ─── 10. LEAST-PRIVILEGE TABLE GRANTS ───────────────────────────────────────
-- Revoke all privileges from PUBLIC and anon to prevent ambient inheritance.

REVOKE ALL PRIVILEGES ON
  public.profiles,
  public.enrollments,
  public.batches,
  public.lessons,
  public.lesson_batches,
  public.announcements,
  public.announcement_batches
FROM PUBLIC, anon;

-- Explicitly grant full CRUD to authenticated and service_role (RLS governs row authorization)
GRANT ALL PRIVILEGES ON
  public.profiles,
  public.enrollments,
  public.batches,
  public.lessons,
  public.lesson_batches,
  public.announcements,
  public.announcement_batches
TO authenticated, service_role;

-- Explicitly grant SELECT to anon (RLS yields 0 rows cleanly without function errors)
GRANT SELECT ON
  public.profiles,
  public.enrollments,
  public.batches,
  public.lessons,
  public.lesson_batches,
  public.announcements,
  public.announcement_batches
TO anon;
