-- ============================================================
-- Migration: 00002_enable_rls.sql
-- Description: Enable Row Level Security on all application tables
-- IMPORTANT: RLS must be enabled BEFORE creating policies.
--            Until policies are added (00003), no rows are accessible
--            to any user via the anon or authenticated role.
-- ============================================================

ALTER TABLE public.batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_batches ENABLE ROW LEVEL SECURITY;
