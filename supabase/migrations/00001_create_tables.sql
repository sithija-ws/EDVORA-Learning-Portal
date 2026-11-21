-- ============================================================
-- Migration: 00001_create_tables.sql
-- Description: Initial schema — all application tables
-- Run: Apply via Supabase dashboard (SQL Editor) or Supabase CLI
-- ============================================================

-- ─── EXTENSION: UUID generation ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── BATCHES ──────────────────────────────────────────────────────────────────
-- Represents an A/L examination year cohort (e.g. "2027 Batch")
CREATE TABLE public.batches (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  year        INTEGER     NOT NULL,
  description TEXT,
  is_archived BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.batches              IS 'A/L examination year cohorts managed by the teacher.';
COMMENT ON COLUMN public.batches.name        IS 'Human-readable batch name, e.g. "2027 Batch". Must be unique.';
COMMENT ON COLUMN public.batches.year        IS 'The A/L examination year this batch is preparing for.';
COMMENT ON COLUMN public.batches.is_archived IS 'Archived batches are hidden from students but visible to the teacher.';

-- ─── PROFILES (extends auth.users) ───────────────────────────────────────────
-- Application-level user data. One row per Supabase Auth user.
CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('teacher', 'student')),
  batch_id    UUID        REFERENCES public.batches(id) ON DELETE SET NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles             IS 'Application profile extending auth.users. One row per user.';
COMMENT ON COLUMN public.profiles.role        IS 'Either "teacher" (single admin) or "student".';
COMMENT ON COLUMN public.profiles.batch_id    IS 'The batch this student belongs to. NULL for the teacher.';
COMMENT ON COLUMN public.profiles.is_active   IS 'False = account is deactivated; student cannot log in.';

-- ─── LESSONS ─────────────────────────────────────────────────────────────────
-- YouTube-based lesson units. Assigned to batches via lesson_batches.
CREATE TABLE public.lessons (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  youtube_id    TEXT        NOT NULL,
  thumbnail_url TEXT,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_by    UUID        NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.lessons              IS 'YouTube-based lesson units created by the teacher.';
COMMENT ON COLUMN public.lessons.youtube_id  IS '11-character YouTube video ID extracted from the URL.';
COMMENT ON COLUMN public.lessons.sort_order  IS 'Display order within the lesson list. Lower = shown first.';

-- ─── LESSON ↔ BATCH (many-to-many) ──────────────────────────────────────────
-- A lesson can be assigned to multiple batches.
CREATE TABLE public.lesson_batches (
  lesson_id  UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  batch_id   UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, batch_id)
);

COMMENT ON TABLE public.lesson_batches IS 'Junction table assigning lessons to one or more batches.';

-- ─── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
-- Text announcements posted by the teacher to specific batches or all batches.
CREATE TABLE public.announcements (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  is_broadcast BOOLEAN     NOT NULL DEFAULT false,
  is_pinned    BOOLEAN     NOT NULL DEFAULT false,
  created_by   UUID        NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.announcements              IS 'Announcements posted by the teacher to students.';
COMMENT ON COLUMN public.announcements.is_broadcast IS 'True = visible to all batches. False = scoped by announcement_batches.';
COMMENT ON COLUMN public.announcements.is_pinned    IS 'Reserved for post-MVP. Schema ready now.';

-- ─── ANNOUNCEMENT ↔ BATCH (many-to-many) ─────────────────────────────────────
-- Only populated when is_broadcast = false.
CREATE TABLE public.announcement_batches (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, batch_id)
);

COMMENT ON TABLE public.announcement_batches IS 'Junction table scoping non-broadcast announcements to specific batches.';

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_profiles_batch_id     ON public.profiles(batch_id);
CREATE INDEX idx_profiles_role         ON public.profiles(role);
CREATE INDEX idx_lesson_batches_batch  ON public.lesson_batches(batch_id);
CREATE INDEX idx_ann_batches_batch     ON public.announcement_batches(batch_id);
CREATE INDEX idx_lessons_sort          ON public.lessons(sort_order);
CREATE INDEX idx_announcements_created ON public.announcements(created_at DESC);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Auto-update updated_at on lessons and announcements.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
