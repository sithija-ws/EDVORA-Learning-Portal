-- ============================================================
-- Migration: 00004_seed_teacher.sql
-- Description: Seed the single teacher account
--
-- USAGE:
--   1. First, create the teacher's Auth user via the Supabase dashboard:
--      Authentication → Users → Add user
--      Email: <teacher's real email>
--      Password: <strong password>
--      ✓ Auto Confirm User (tick this)
--
--   2. Copy the UUID shown for the new user.
--
--   3. Replace <TEACHER_AUTH_UUID> and <TEACHER_FULL_NAME> below.
--
--   4. Run this migration in the Supabase SQL Editor.
--
-- Why not fully automated?
--   The teacher uses their real email address so Supabase can send
--   genuine password reset emails. Creating Auth users via SQL requires
--   inserting into auth.users directly, which is not recommended.
--   The dashboard flow is simpler and safer.
-- ============================================================

-- Replace these placeholder values before running:
DO $$
DECLARE
  v_teacher_id  UUID := '<TEACHER_AUTH_UUID>';   -- paste UUID from Auth dashboard
  v_full_name   TEXT := 'Teacher Name';          -- replace with actual name
BEGIN
  INSERT INTO public.profiles (id, full_name, role, batch_id, is_active)
  VALUES (v_teacher_id, v_full_name, 'teacher', NULL, true)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role      = EXCLUDED.role;
END $$;
