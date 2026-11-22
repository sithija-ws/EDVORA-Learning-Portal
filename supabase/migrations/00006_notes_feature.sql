-- ============================================================================
-- Migration: 00006_notes_feature.sql
-- Description: PDF study notes and handouts management for batches.
-- ============================================================================

-- ─── 1. CREATE NOTES TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  file_url    TEXT        NOT NULL,
  file_name   TEXT        NOT NULL,
  file_size   BIGINT,
  created_by  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.notes             IS 'Study materials and PDF notes uploaded by teacher.';
COMMENT ON COLUMN public.notes.id          IS 'Unique note identifier.';
COMMENT ON COLUMN public.notes.title       IS 'Title or chapter topic of the note.';
COMMENT ON COLUMN public.notes.description IS 'Optional summary or study guide notes.';
COMMENT ON COLUMN public.notes.file_url    IS 'Public URL to the PDF document.';
COMMENT ON COLUMN public.notes.file_name   IS 'Original file name of the uploaded document.';
COMMENT ON COLUMN public.notes.file_size   IS 'File size in bytes.';
COMMENT ON COLUMN public.notes.created_by  IS 'Teacher profile who uploaded the note.';

-- ─── 2. CREATE NOTE_BATCHES JUNCTION TABLE ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.note_batches (
  note_id  UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, batch_id)
);

COMMENT ON TABLE  public.note_batches          IS 'Junction table assigning notes to batches (M:N).';
COMMENT ON COLUMN public.note_batches.note_id  IS 'References the note.';
COMMENT ON COLUMN public.note_batches.batch_id IS 'References the batch authorized to view the note.';

-- ─── 3. CREATE STORAGE BUCKET FOR NOTES ─────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('notes', 'notes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ─── 4. ENABLE ROW LEVEL SECURITY ───────────────────────────────────────────

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_batches ENABLE ROW LEVEL SECURITY;

-- ─── 5. RLS POLICIES FOR NOTES ──────────────────────────────────────────────

-- Teacher: full access to manage all notes
DROP POLICY IF EXISTS "teacher_all_notes" ON public.notes;
CREATE POLICY "teacher_all_notes"
  ON public.notes
  FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

-- Student: SELECT notes assigned to batches they are enrolled in
DROP POLICY IF EXISTS "student_select_enrolled_notes" ON public.notes;
CREATE POLICY "student_select_enrolled_notes"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.note_batches nb
      JOIN public.enrollments e ON nb.batch_id = e.batch_id
      WHERE nb.note_id = notes.id
        AND e.student_id = auth.uid()
    )
  );

-- ─── 6. RLS POLICIES FOR NOTE_BATCHES ───────────────────────────────────────

-- Teacher: full access to manage all note-batch junctions
DROP POLICY IF EXISTS "teacher_all_note_batches" ON public.note_batches;
CREATE POLICY "teacher_all_note_batches"
  ON public.note_batches
  FOR ALL
  TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

-- Student: SELECT junction rows for batches they are enrolled in
DROP POLICY IF EXISTS "student_select_enrolled_note_batches" ON public.note_batches;
CREATE POLICY "student_select_enrolled_note_batches"
  ON public.note_batches
  FOR SELECT
  TO authenticated
  USING (public.is_enrolled_in_batch(batch_id));

-- ─── 7. STORAGE POLICIES ────────────────────────────────────────────────────

-- Teacher can upload to the notes bucket
DROP POLICY IF EXISTS "teacher_upload_notes_storage" ON storage.objects;
CREATE POLICY "teacher_upload_notes_storage"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'notes' AND public.is_teacher());

-- Teacher can update and delete in the notes bucket
DROP POLICY IF EXISTS "teacher_manage_notes_storage" ON storage.objects;
CREATE POLICY "teacher_manage_notes_storage"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'notes' AND public.is_teacher())
  WITH CHECK (bucket_id = 'notes' AND public.is_teacher());

-- Anyone authenticated can read notes
DROP POLICY IF EXISTS "authenticated_read_notes_storage" ON storage.objects;
CREATE POLICY "authenticated_read_notes_storage"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'notes');

-- ─── 8. PERMISSIONS & GRANTS ────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_batches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_batches TO authenticated;
