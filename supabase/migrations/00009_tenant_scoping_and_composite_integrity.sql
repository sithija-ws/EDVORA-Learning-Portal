-- ============================================================================
-- Migration: 00009_tenant_scoping_and_composite_integrity.sql
-- Description: Adds tenant_id to all resource and junction tables, backfills
--              existing data, replaces global batch name uniqueness with tenant
--              scoped uniqueness, and enforces composite foreign keys.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. ADD NULLABLE TENANT_ID COLUMNS ──────────────────────────────────────

ALTER TABLE public.batches              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.lessons              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notes                ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.announcements        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.lesson_batches       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.note_batches         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_batches ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ─── 2. BACKFILL ALL EXISTING DATA WITH DEFAULT TENANT ──────────────────────

DO $$
DECLARE
  v_default_tenant_id UUID;
BEGIN
  SELECT id INTO v_default_tenant_id
  FROM public.tenants
  WHERE slug = 'default-workspace'
  LIMIT 1;

  IF v_default_tenant_id IS NOT NULL THEN
    -- Backfill core entities
    UPDATE public.batches       SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.lessons       SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.notes         SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.announcements SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

    -- Backfill junction tables from their parent batches
    UPDATE public.enrollments e
    SET tenant_id = b.tenant_id
    FROM public.batches b
    WHERE b.id = e.batch_id AND e.tenant_id IS NULL;

    UPDATE public.lesson_batches lb
    SET tenant_id = b.tenant_id
    FROM public.batches b
    WHERE b.id = lb.batch_id AND lb.tenant_id IS NULL;

    UPDATE public.note_batches nb
    SET tenant_id = b.tenant_id
    FROM public.batches b
    WHERE b.id = nb.batch_id AND nb.tenant_id IS NULL;

    UPDATE public.announcement_batches ab
    SET tenant_id = b.tenant_id
    FROM public.batches b
    WHERE b.id = ab.batch_id AND ab.tenant_id IS NULL;

    -- Safety catch: if any junction records were unlinked to batches, set to default
    UPDATE public.enrollments          SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.lesson_batches       SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.note_batches         SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    UPDATE public.announcement_batches SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;

-- ─── 3. ENFORCE NOT NULL CONSTRAINTS ────────────────────────────────────────

ALTER TABLE public.batches              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lessons              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.notes                ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.announcements        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.enrollments          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lesson_batches       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.note_batches         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.announcement_batches ALTER COLUMN tenant_id SET NOT NULL;

-- ─── 4. FIX BATCH NAME UNIQUE CONSTRAINT ────────────────────────────────────
-- Drop global uniqueness and introduce tenant-scoped uniqueness.

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_tenant_name
  ON public.batches (tenant_id, name);

-- ─── 5. ADD COMPOSITE UNIQUE CONSTRAINTS (ID, TENANT_ID) ───────────────────
-- Required to enable composite foreign keys on junction tables.

ALTER TABLE public.batches       ADD CONSTRAINT uq_batches_id_tenant       UNIQUE (id, tenant_id);
ALTER TABLE public.lessons       ADD CONSTRAINT uq_lessons_id_tenant       UNIQUE (id, tenant_id);
ALTER TABLE public.notes         ADD CONSTRAINT uq_notes_id_tenant         UNIQUE (id, tenant_id);
ALTER TABLE public.announcements ADD CONSTRAINT uq_announcements_id_tenant UNIQUE (id, tenant_id);

-- ─── 6. ENFORCE COMPOSITE FOREIGN KEYS ON JUNCTION TABLES ───────────────────
-- Guarantees cross-tenant linking is impossible at the PostgreSQL engine level.

-- [LESSON_BATCHES]
ALTER TABLE public.lesson_batches
  ADD CONSTRAINT fk_lb_lesson_tenant
  FOREIGN KEY (lesson_id, tenant_id)
  REFERENCES public.lessons (id, tenant_id)
  ON DELETE CASCADE;

ALTER TABLE public.lesson_batches
  ADD CONSTRAINT fk_lb_batch_tenant
  FOREIGN KEY (batch_id, tenant_id)
  REFERENCES public.batches (id, tenant_id)
  ON DELETE CASCADE;

-- [NOTE_BATCHES]
ALTER TABLE public.note_batches
  ADD CONSTRAINT fk_nb_note_tenant
  FOREIGN KEY (note_id, tenant_id)
  REFERENCES public.notes (id, tenant_id)
  ON DELETE CASCADE;

ALTER TABLE public.note_batches
  ADD CONSTRAINT fk_nb_batch_tenant
  FOREIGN KEY (batch_id, tenant_id)
  REFERENCES public.batches (id, tenant_id)
  ON DELETE CASCADE;

-- [ANNOUNCEMENT_BATCHES]
ALTER TABLE public.announcement_batches
  ADD CONSTRAINT fk_ab_announcement_tenant
  FOREIGN KEY (announcement_id, tenant_id)
  REFERENCES public.announcements (id, tenant_id)
  ON DELETE CASCADE;

ALTER TABLE public.announcement_batches
  ADD CONSTRAINT fk_ab_batch_tenant
  FOREIGN KEY (batch_id, tenant_id)
  REFERENCES public.batches (id, tenant_id)
  ON DELETE CASCADE;

-- [ENROLLMENTS]
ALTER TABLE public.enrollments
  ADD CONSTRAINT fk_enrollments_batch_tenant
  FOREIGN KEY (batch_id, tenant_id)
  REFERENCES public.batches (id, tenant_id)
  ON DELETE CASCADE;

ALTER TABLE public.enrollments
  ADD CONSTRAINT fk_enrollments_student_identity
  FOREIGN KEY (tenant_id, student_id)
  REFERENCES public.student_identities (tenant_id, student_id)
  ON DELETE CASCADE;

-- ─── 7. PERFORMANCE INDEXES ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_batches_tenant_id       ON public.batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lessons_tenant_id       ON public.lessons (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_id         ON public.notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id ON public.announcements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_tenant_id   ON public.enrollments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lesson_batches_tenant   ON public.lesson_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_note_batches_tenant     ON public.note_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ann_batches_tenant      ON public.announcement_batches (tenant_id);
