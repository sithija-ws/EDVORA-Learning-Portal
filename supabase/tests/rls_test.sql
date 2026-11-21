-- ============================================================================
-- EDVORA — Comprehensive RLS & Security Test Suite
-- Target File: supabase/tests/rls_test.sql
-- Invariant Plan: Exactly 138 Assertions
-- ============================================================================

BEGIN;

SELECT plan(138);

-- ─── 0. SETUP DETERMINISTIC FIXTURES ─────────────────────────────────────────

CREATE TEMPORARY TABLE test_fixtures AS
SELECT
  gen_random_uuid() AS teacher_id,
  gen_random_uuid() AS student_a_id,
  gen_random_uuid() AS student_b_id,
  gen_random_uuid() AS student_c_id,
  gen_random_uuid() AS student_d_id,
  gen_random_uuid() AS orphan_id,
  gen_random_uuid() AS b_2026_id,
  gen_random_uuid() AS b_2027_id,
  gen_random_uuid() AS b_2024_id,
  gen_random_uuid() AS l_2026_id,
  gen_random_uuid() AS l_2027_id,
  gen_random_uuid() AS l_shared_id,
  gen_random_uuid() AS l_2024_id,
  gen_random_uuid() AS a_bcast_id,
  gen_random_uuid() AS a_2026_id,
  gen_random_uuid() AS a_2027_id,
  gen_random_uuid() AS a_2024_id,
  gen_random_uuid() AS crud_prof_id,
  gen_random_uuid() AS crud_batch_id,
  gen_random_uuid() AS crud_less_id,
  gen_random_uuid() AS crud_ann_id;

-- Ensure fixture metadata is queryable across all role switches
GRANT SELECT ON test_fixtures TO authenticated, anon;

-- Populate auth.users fixtures
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT teacher_id, 'authenticated', 'authenticated', 'teacher@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures
UNION ALL
SELECT student_a_id, 'authenticated', 'authenticated', 'student_a@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures
UNION ALL
SELECT student_b_id, 'authenticated', 'authenticated', 'student_b@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures
UNION ALL
SELECT student_c_id, 'authenticated', 'authenticated', 'student_c@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures
UNION ALL
SELECT student_d_id, 'authenticated', 'authenticated', 'student_d@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures
UNION ALL
SELECT orphan_id, 'authenticated', 'authenticated', 'orphan@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures
UNION ALL
SELECT crud_prof_id, 'authenticated', 'authenticated', 'crud_prof@edvora.internal', '{"provider":"email","providers":["email"]}', '{}', now(), now() FROM test_fixtures;

-- Populate public.profiles fixtures
INSERT INTO public.profiles (id, full_name, role, is_active)
SELECT teacher_id, 'Teacher Admin', 'teacher', true FROM test_fixtures
UNION ALL
SELECT student_a_id, 'Student A', 'student', true FROM test_fixtures
UNION ALL
SELECT student_b_id, 'Student B', 'student', true FROM test_fixtures
UNION ALL
SELECT student_c_id, 'Student C', 'student', true FROM test_fixtures
UNION ALL
SELECT student_d_id, 'Student D', 'student', false FROM test_fixtures;

-- Populate public.batches fixtures
INSERT INTO public.batches (id, name, year, is_archived)
SELECT b_2026_id, 'Batch 2026', 2026, false FROM test_fixtures
UNION ALL
SELECT b_2027_id, 'Batch 2027', 2027, false FROM test_fixtures
UNION ALL
SELECT b_2024_id, 'Batch 2024', 2024, true FROM test_fixtures;

-- Populate public.enrollments fixtures
INSERT INTO public.enrollments (student_id, batch_id)
SELECT student_a_id, b_2026_id FROM test_fixtures
UNION ALL
SELECT student_b_id, b_2026_id FROM test_fixtures
UNION ALL
SELECT student_b_id, b_2027_id FROM test_fixtures
UNION ALL
SELECT student_c_id, b_2024_id FROM test_fixtures
UNION ALL
SELECT student_d_id, b_2026_id FROM test_fixtures;

-- Populate public.lessons fixtures (All YouTube IDs strictly 11 chars)
INSERT INTO public.lessons (id, title, description, youtube_id, created_by)
SELECT l_2026_id, 'Lesson 2026', 'Batch 2026 Exclusive', 'act2026vid1', teacher_id FROM test_fixtures
UNION ALL
SELECT l_2027_id, 'Lesson 2027', 'Batch 2027 Exclusive', 'act2027vid1', teacher_id FROM test_fixtures
UNION ALL
SELECT l_shared_id, 'Shared Lesson', 'Multi-Batch Lesson', 'sharedvide1', teacher_id FROM test_fixtures
UNION ALL
SELECT l_2024_id, 'Lesson 2024', 'Archived Batch Lesson', 'archivedvd1', teacher_id FROM test_fixtures;

-- Populate public.lesson_batches fixtures
INSERT INTO public.lesson_batches (lesson_id, batch_id)
SELECT l_2026_id, b_2026_id FROM test_fixtures
UNION ALL
SELECT l_2027_id, b_2027_id FROM test_fixtures
UNION ALL
SELECT l_shared_id, b_2026_id FROM test_fixtures
UNION ALL
SELECT l_shared_id, b_2027_id FROM test_fixtures
UNION ALL
SELECT l_2024_id, b_2024_id FROM test_fixtures;

-- Populate public.announcements fixtures
INSERT INTO public.announcements (id, title, content, is_broadcast, created_by)
SELECT a_bcast_id, 'Global Broadcast', 'All Active Students', true, teacher_id FROM test_fixtures
UNION ALL
SELECT a_2026_id, 'Batch 2026 Notice', 'Targeted to 2026', false, teacher_id FROM test_fixtures
UNION ALL
SELECT a_2027_id, 'Batch 2027 Notice', 'Targeted to 2027', false, teacher_id FROM test_fixtures
UNION ALL
SELECT a_2024_id, 'Batch 2024 Notice', 'Targeted to 2024', false, teacher_id FROM test_fixtures;

-- Populate public.announcement_batches fixtures
INSERT INTO public.announcement_batches (announcement_id, batch_id)
SELECT a_2026_id, b_2026_id FROM test_fixtures
UNION ALL
SELECT a_2027_id, b_2027_id FROM test_fixtures
UNION ALL
SELECT a_2024_id, b_2024_id FROM test_fixtures;

-- ─── 1. TABLE PRIVILEGE VERIFICATION (T001 - T035) ───────────────────────────

-- Authenticated table privileges
SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'T001: authenticated has SELECT on profiles');
SELECT ok(has_table_privilege('authenticated', 'public.enrollments', 'SELECT'), 'T002: authenticated has SELECT on enrollments');
SELECT ok(has_table_privilege('authenticated', 'public.batches', 'SELECT'), 'T003: authenticated has SELECT on batches');
SELECT ok(has_table_privilege('authenticated', 'public.lessons', 'SELECT'), 'T004: authenticated has SELECT on lessons');
SELECT ok(has_table_privilege('authenticated', 'public.lesson_batches', 'SELECT'), 'T005: authenticated has SELECT on lesson_batches');
SELECT ok(has_table_privilege('authenticated', 'public.announcements', 'SELECT'), 'T006: authenticated has SELECT on announcements');
SELECT ok(has_table_privilege('authenticated', 'public.announcement_batches', 'SELECT'), 'T007: authenticated has SELECT on announcement_batches');

SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'T008: authenticated has INSERT on profiles');
SELECT ok(has_table_privilege('authenticated', 'public.enrollments', 'INSERT'), 'T009: authenticated has INSERT on enrollments');
SELECT ok(has_table_privilege('authenticated', 'public.batches', 'INSERT'), 'T010: authenticated has INSERT on batches');
SELECT ok(has_table_privilege('authenticated', 'public.lessons', 'INSERT'), 'T011: authenticated has INSERT on lessons');
SELECT ok(has_table_privilege('authenticated', 'public.lesson_batches', 'INSERT'), 'T012: authenticated has INSERT on lesson_batches');
SELECT ok(has_table_privilege('authenticated', 'public.announcements', 'INSERT'), 'T013: authenticated has INSERT on announcements');
SELECT ok(has_table_privilege('authenticated', 'public.announcement_batches', 'INSERT'), 'T014: authenticated has INSERT on announcement_batches');

SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'T015: authenticated has UPDATE on profiles');
SELECT ok(has_table_privilege('authenticated', 'public.enrollments', 'UPDATE'), 'T016: authenticated has UPDATE on enrollments');
SELECT ok(has_table_privilege('authenticated', 'public.batches', 'UPDATE'), 'T017: authenticated has UPDATE on batches');
SELECT ok(has_table_privilege('authenticated', 'public.lessons', 'UPDATE'), 'T018: authenticated has UPDATE on lessons');
SELECT ok(has_table_privilege('authenticated', 'public.lesson_batches', 'UPDATE'), 'T019: authenticated has UPDATE on lesson_batches');
SELECT ok(has_table_privilege('authenticated', 'public.announcements', 'UPDATE'), 'T020: authenticated has UPDATE on announcements');
SELECT ok(has_table_privilege('authenticated', 'public.announcement_batches', 'UPDATE'), 'T021: authenticated has UPDATE on announcement_batches');

SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'T022: authenticated has DELETE on profiles');
SELECT ok(has_table_privilege('authenticated', 'public.enrollments', 'DELETE'), 'T023: authenticated has DELETE on enrollments');
SELECT ok(has_table_privilege('authenticated', 'public.batches', 'DELETE'), 'T024: authenticated has DELETE on batches');
SELECT ok(has_table_privilege('authenticated', 'public.lessons', 'DELETE'), 'T025: authenticated has DELETE on lessons');
SELECT ok(has_table_privilege('authenticated', 'public.lesson_batches', 'DELETE'), 'T026: authenticated has DELETE on lesson_batches');
SELECT ok(has_table_privilege('authenticated', 'public.announcements', 'DELETE'), 'T027: authenticated has DELETE on announcements');
SELECT ok(has_table_privilege('authenticated', 'public.announcement_batches', 'DELETE'), 'T028: authenticated has DELETE on announcement_batches');

-- Anon table privileges (SELECT only)
SELECT ok(has_table_privilege('anon', 'public.profiles', 'SELECT'), 'T029: anon has SELECT on profiles');
SELECT ok(has_table_privilege('anon', 'public.enrollments', 'SELECT'), 'T030: anon has SELECT on enrollments');
SELECT ok(has_table_privilege('anon', 'public.batches', 'SELECT'), 'T031: anon has SELECT on batches');
SELECT ok(has_table_privilege('anon', 'public.lessons', 'SELECT'), 'T032: anon has SELECT on lessons');
SELECT ok(has_table_privilege('anon', 'public.lesson_batches', 'SELECT'), 'T033: anon has SELECT on lesson_batches');
SELECT ok(has_table_privilege('anon', 'public.announcements', 'SELECT'), 'T034: anon has SELECT on announcements');
SELECT ok(has_table_privilege('anon', 'public.announcement_batches', 'SELECT'), 'T035: anon has SELECT on announcement_batches');

-- ─── 2. TEACHER IDENTITY, ARCHIVED VISIBILITY & FULL CRUD (T036 - T070) ──────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT teacher_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT teacher_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- Helper function verification
SELECT is(public.is_teacher(), true, 'T036: is_teacher returns true for teacher');
SELECT is(public.is_student(), false, 'T037: is_student returns false for teacher');
SELECT is(public.is_enrolled_in_batch((SELECT b_2026_id FROM test_fixtures)), false, 'T038: is_enrolled_in_batch returns false for teacher');

-- Archived visibility
SELECT is((SELECT count(*)::int FROM public.batches WHERE id = (SELECT b_2024_id FROM test_fixtures)), 1, 'T039: Teacher can SELECT archived Batch 2024');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = (SELECT l_2024_id FROM test_fixtures)), 1, 'T040: Teacher can SELECT archived Lesson 2024');
SELECT is((SELECT count(*)::int FROM public.lesson_batches WHERE batch_id = (SELECT b_2024_id FROM test_fixtures)), 1, 'T041: Teacher can SELECT archived lesson_batches');
SELECT is((SELECT count(*)::int FROM public.announcements WHERE id = (SELECT a_2024_id FROM test_fixtures)), 1, 'T042: Teacher can SELECT archived targeted announcement');

-- Teacher Comprehensive CRUD
-- profiles
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.profiles (id, full_name, role, is_active) VALUES ((SELECT crud_prof_id FROM test_fixtures), 'CRUD Profile', 'student', true) RETURNING id) t), 1, 'T043: Teacher can INSERT profile');
SELECT is((SELECT count(*)::int FROM public.profiles), 6, 'T044: Teacher can SELECT all profiles');
SELECT results_eq($$UPDATE public.profiles SET full_name = 'Updated Profile' WHERE id = (SELECT crud_prof_id FROM test_fixtures) RETURNING full_name$$, $$VALUES ('Updated Profile')$$, 'T045: Teacher can UPDATE profile');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.profiles WHERE id = (SELECT crud_prof_id FROM test_fixtures) RETURNING id) t), 1, 'T046: Teacher can DELETE profile');

-- enrollments
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.enrollments (student_id, batch_id) VALUES ((SELECT student_a_id FROM test_fixtures), (SELECT b_2027_id FROM test_fixtures)) RETURNING student_id) t), 1, 'T047: Teacher can INSERT enrollment');
SELECT is((SELECT count(*)::int FROM public.enrollments), 6, 'T048: Teacher can SELECT all enrollments');
SELECT results_eq($$UPDATE public.enrollments SET created_at = '2026-01-01 00:00:00+00' WHERE student_id = (SELECT student_a_id FROM test_fixtures) AND batch_id = (SELECT b_2027_id FROM test_fixtures) RETURNING created_at$$, $$VALUES ('2026-01-01 00:00:00+00'::timestamptz)$$, 'T049: Teacher can UPDATE enrollment');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.enrollments WHERE student_id = (SELECT student_a_id FROM test_fixtures) AND batch_id = (SELECT b_2027_id FROM test_fixtures) RETURNING student_id) t), 1, 'T050: Teacher can DELETE enrollment');

-- batches
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.batches (id, name, year, is_archived) VALUES ((SELECT crud_batch_id FROM test_fixtures), 'Batch 2028', 2028, false) RETURNING id) t), 1, 'T051: Teacher can INSERT batch');
SELECT is((SELECT count(*)::int FROM public.batches), 4, 'T052: Teacher can SELECT all batches');
SELECT results_eq($$UPDATE public.batches SET name = 'Batch 2028 Updated' WHERE id = (SELECT crud_batch_id FROM test_fixtures) RETURNING name$$, $$VALUES ('Batch 2028 Updated')$$, 'T053: Teacher can UPDATE batch');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.batches WHERE id = (SELECT crud_batch_id FROM test_fixtures) RETURNING id) t), 1, 'T054: Teacher can DELETE batch');

-- lessons
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.lessons (id, title, youtube_id, created_by) VALUES ((SELECT crud_less_id FROM test_fixtures), 'CRUD Lesson', 'crudlesson1', (SELECT teacher_id FROM test_fixtures)) RETURNING id) t), 1, 'T055: Teacher can INSERT lesson with 11-char ID');
SELECT is((SELECT count(*)::int FROM public.lessons), 5, 'T056: Teacher can SELECT all lessons');
SELECT results_eq($$UPDATE public.lessons SET title = 'Updated Lesson' WHERE id = (SELECT crud_less_id FROM test_fixtures) RETURNING title$$, $$VALUES ('Updated Lesson')$$, 'T057: Teacher can UPDATE lesson');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.lessons WHERE id = (SELECT crud_less_id FROM test_fixtures) RETURNING id) t), 1, 'T058: Teacher can DELETE lesson');

-- lesson_batches
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.lesson_batches (lesson_id, batch_id) VALUES ((SELECT l_2026_id FROM test_fixtures), (SELECT b_2027_id FROM test_fixtures)) RETURNING lesson_id) t), 1, 'T059: Teacher can INSERT lesson_batch');
SELECT is((SELECT count(*)::int FROM public.lesson_batches), 6, 'T060: Teacher can SELECT all lesson_batches');
SELECT results_eq($$UPDATE public.lesson_batches SET batch_id = (SELECT b_2024_id FROM test_fixtures) WHERE lesson_id = (SELECT l_2026_id FROM test_fixtures) AND batch_id = (SELECT b_2027_id FROM test_fixtures) RETURNING batch_id$$, $$SELECT b_2024_id FROM test_fixtures$$, 'T061: Teacher can UPDATE lesson_batch');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.lesson_batches WHERE lesson_id = (SELECT l_2026_id FROM test_fixtures) AND batch_id = (SELECT b_2024_id FROM test_fixtures) RETURNING lesson_id) t), 1, 'T062: Teacher can DELETE lesson_batch');

-- announcements
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.announcements (id, title, content, is_broadcast, created_by) VALUES ((SELECT crud_ann_id FROM test_fixtures), 'CRUD Notice', 'Teacher testing', false, (SELECT teacher_id FROM test_fixtures)) RETURNING id) t), 1, 'T063: Teacher can INSERT announcement');
SELECT is((SELECT count(*)::int FROM public.announcements), 5, 'T064: Teacher can SELECT all announcements');
SELECT results_eq($$UPDATE public.announcements SET title = 'Updated Notice' WHERE id = (SELECT crud_ann_id FROM test_fixtures) RETURNING title$$, $$VALUES ('Updated Notice')$$, 'T065: Teacher can UPDATE announcement');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.announcements WHERE id = (SELECT crud_ann_id FROM test_fixtures) RETURNING id) t), 1, 'T066: Teacher can DELETE announcement');

-- announcement_batches
SELECT is((SELECT count(*)::int FROM (INSERT INTO public.announcement_batches (announcement_id, batch_id) VALUES ((SELECT a_2026_id FROM test_fixtures), (SELECT b_2027_id FROM test_fixtures)) RETURNING announcement_id) t), 1, 'T067: Teacher can INSERT announcement_batch');
SELECT is((SELECT count(*)::int FROM public.announcement_batches), 4, 'T068: Teacher can SELECT all announcement_batches');
SELECT results_eq($$UPDATE public.announcement_batches SET batch_id = (SELECT b_2024_id FROM test_fixtures) WHERE announcement_id = (SELECT a_2026_id FROM test_fixtures) AND batch_id = (SELECT b_2027_id FROM test_fixtures) RETURNING batch_id$$, $$SELECT b_2024_id FROM test_fixtures$$, 'T069: Teacher can UPDATE announcement_batch');
SELECT is((SELECT count(*)::int FROM (DELETE FROM public.announcement_batches WHERE announcement_id = (SELECT a_2026_id FROM test_fixtures) AND batch_id = (SELECT b_2024_id FROM test_fixtures) RETURNING announcement_id) t), 1, 'T070: Teacher can DELETE announcement_batch');

-- ─── 3. STUDENT A SCOPING & ISOLATION (T071 - T081) ──────────────────────────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT student_a_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT student_a_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = (SELECT student_a_id FROM test_fixtures)), 1, 'T071: Student A can SELECT own profile');
SELECT is((SELECT count(*)::int FROM public.batches), 1, 'T072: Student A sees exactly 1 batch (Batch 2026)');
SELECT is((SELECT count(*)::int FROM public.enrollments), 1, 'T073: Student A sees exactly 1 enrollment (Batch 2026)');
SELECT is((SELECT count(*)::int FROM public.lessons), 2, 'T074: Student A sees 2 lessons (Lesson 2026 and Shared Lesson)');
SELECT is((SELECT count(*)::int FROM public.lesson_batches), 2, 'T075: Student A sees 2 lesson_batches for Batch 2026');
SELECT is((SELECT count(*)::int FROM public.announcements), 2, 'T076: Student A sees 2 announcements (Broadcast and Batch 2026)');
SELECT is((SELECT count(*)::int FROM public.announcement_batches), 1, 'T077: Student A sees 1 announcement_batch for Batch 2026');

-- Scope & Peer Isolation
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = (SELECT student_b_id FROM test_fixtures)), 0, 'T078: Student A cannot SELECT Student B profile');
SELECT is((SELECT count(*)::int FROM public.enrollments WHERE student_id = (SELECT student_b_id FROM test_fixtures)), 0, 'T079: Student A cannot SELECT Student B enrollments');
SELECT is((SELECT count(*)::int FROM public.batches WHERE id = (SELECT b_2027_id FROM test_fixtures)), 0, 'T080: Student A cannot SELECT unenrolled Batch 2027');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = (SELECT l_2027_id FROM test_fixtures)), 0, 'T081: Student A cannot SELECT Lesson 2027');

-- ─── 4. STUDENT B MULTI-BATCH ACCESS (T082 - T086) ───────────────────────────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT student_b_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT student_b_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::int FROM public.batches), 2, 'T082: Student B sees 2 batches (Batch 2026 and Batch 2027)');
SELECT is((SELECT count(*)::int FROM public.enrollments), 2, 'T083: Student B sees 2 enrollments (Batch 2026 and Batch 2027)');
SELECT is((SELECT count(*)::int FROM public.lessons), 3, 'T084: Student B sees 3 lessons (Lesson 2026, Lesson 2027, Shared Lesson)');
SELECT is((SELECT count(*)::int FROM public.announcements), 3, 'T085: Student B sees 3 announcements (Broadcast, Batch 2026, Batch 2027)');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = (SELECT l_2024_id FROM test_fixtures)), 0, 'T086: Student B cannot SELECT Lesson 2024 (archived)');

-- ─── 5. STUDENT C ARCHIVED ISOLATION & BROADCAST ACCESS (T087 - T093) ────────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT student_c_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT student_c_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = (SELECT student_c_id FROM test_fixtures)), 1, 'T087: Student C can SELECT own profile');
SELECT is((SELECT count(*)::int FROM public.batches WHERE id = (SELECT b_2024_id FROM test_fixtures)), 0, 'T088: Student C cannot SELECT archived Batch 2024');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = (SELECT l_2024_id FROM test_fixtures)), 0, 'T089: Student C cannot SELECT Lesson 2024');
SELECT is((SELECT count(*)::int FROM public.lesson_batches WHERE batch_id = (SELECT b_2024_id FROM test_fixtures)), 0, 'T090: Student C cannot SELECT lesson_batches for Batch 2024');
SELECT is((SELECT count(*)::int FROM public.announcement_batches WHERE batch_id = (SELECT b_2024_id FROM test_fixtures)), 0, 'T091: Student C cannot SELECT announcement_batches for Batch 2024');
SELECT is((SELECT count(*)::int FROM public.announcements WHERE id = (SELECT a_bcast_id FROM test_fixtures)), 1, 'T092: Student C CAN SELECT broadcast announcement');
SELECT is((SELECT count(*)::int FROM public.announcements WHERE id = (SELECT a_2024_id FROM test_fixtures)), 0, 'T093: Student C cannot SELECT targeted notice for Batch 2024');

-- ─── 6. STUDENT D INACTIVE PROFILE ISOLATION (T094 - T099) ───────────────────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT student_d_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT student_d_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT results_eq($$SELECT full_name, is_active FROM public.profiles WHERE id = (SELECT student_d_id FROM test_fixtures)$$, $$VALUES ('Student D', false)$$, 'T094: Inactive Student D CAN SELECT own profile');
SELECT is((SELECT count(*)::int FROM public.enrollments), 0, 'T095: Inactive Student D cannot SELECT enrollments');
SELECT is((SELECT count(*)::int FROM public.batches), 0, 'T096: Inactive Student D cannot SELECT batches');
SELECT is((SELECT count(*)::int FROM public.lessons), 0, 'T097: Inactive Student D cannot SELECT lessons');
SELECT is((SELECT count(*)::int FROM public.announcements), 0, 'T098: Inactive Student D cannot SELECT announcements (including broadcast)');
SELECT is((SELECT count(*)::int FROM public.lesson_batches), 0, 'T099: Inactive Student D cannot SELECT junction rows');

-- ─── 7. COMPREHENSIVE STUDENT WRITE-DENIALS (T100 - T123) ────────────────────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT student_a_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT student_a_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- profiles write denials
SELECT throws_ok($$INSERT INTO public.profiles (id, full_name, role, is_active) VALUES (gen_random_uuid(), 'Hacker', 'teacher', true)$$, '42501', NULL, 'T100: Student cannot INSERT into profiles');
SELECT is_empty($$UPDATE public.profiles SET full_name = 'Hacked A' WHERE id = (SELECT student_a_id FROM test_fixtures) RETURNING id$$, 'T101: Student cannot UPDATE own profile');
SELECT is_empty($$UPDATE public.profiles SET full_name = 'Hacked B' WHERE id = (SELECT student_b_id FROM test_fixtures) RETURNING id$$, 'T102: Student cannot UPDATE Student B profile');
SELECT is_empty($$DELETE FROM public.profiles WHERE id = (SELECT student_a_id FROM test_fixtures) RETURNING id$$, 'T103: Student cannot DELETE own profile');

-- enrollments write denials
SELECT throws_ok($$INSERT INTO public.enrollments (student_id, batch_id) VALUES ((SELECT student_a_id FROM test_fixtures), (SELECT b_2027_id FROM test_fixtures))$$, '42501', NULL, 'T104: Student cannot self-enroll (INSERT enrollments)');
SELECT is_empty($$UPDATE public.enrollments SET batch_id = (SELECT b_2027_id FROM test_fixtures) WHERE student_id = (SELECT student_a_id FROM test_fixtures) RETURNING student_id$$, 'T105: Student cannot UPDATE own enrollment');
SELECT is_empty($$UPDATE public.enrollments SET batch_id = (SELECT b_2024_id FROM test_fixtures) WHERE student_id = (SELECT student_b_id FROM test_fixtures) RETURNING student_id$$, 'T106: Student cannot UPDATE Student B enrollment');
SELECT is_empty($$DELETE FROM public.enrollments WHERE student_id = (SELECT student_a_id FROM test_fixtures) RETURNING student_id$$, 'T107: Student cannot DELETE own enrollment');
SELECT is_empty($$DELETE FROM public.enrollments WHERE student_id = (SELECT student_b_id FROM test_fixtures) RETURNING student_id$$, 'T108: Student cannot DELETE Student B enrollment');

-- batches write denials
SELECT throws_ok($$INSERT INTO public.batches (name, year) VALUES ('Hacked Batch', 2029)$$, '42501', NULL, 'T109: Student cannot INSERT into batches');
SELECT is_empty($$UPDATE public.batches SET name = 'Hacked Batch' WHERE id = (SELECT b_2026_id FROM test_fixtures) RETURNING id$$, 'T110: Student cannot UPDATE batches');
SELECT is_empty($$DELETE FROM public.batches WHERE id = (SELECT b_2026_id FROM test_fixtures) RETURNING id$$, 'T111: Student cannot DELETE batches');

-- lessons write denials
SELECT throws_ok($$INSERT INTO public.lessons (title, youtube_id, created_by) VALUES ('Hacked Lesson', 'hackedvide1', (SELECT student_a_id FROM test_fixtures))$$, '42501', NULL, 'T112: Student cannot INSERT into lessons');
SELECT is_empty($$UPDATE public.lessons SET title = 'Hacked Lesson' WHERE id = (SELECT l_2026_id FROM test_fixtures) RETURNING id$$, 'T113: Student cannot UPDATE lessons');
SELECT is_empty($$DELETE FROM public.lessons WHERE id = (SELECT l_2026_id FROM test_fixtures) RETURNING id$$, 'T114: Student cannot DELETE lessons');

-- lesson_batches write denials
SELECT throws_ok($$INSERT INTO public.lesson_batches (lesson_id, batch_id) VALUES ((SELECT l_2027_id FROM test_fixtures), (SELECT b_2026_id FROM test_fixtures))$$, '42501', NULL, 'T115: Student cannot INSERT into lesson_batches');
SELECT is_empty($$UPDATE public.lesson_batches SET batch_id = (SELECT b_2027_id FROM test_fixtures) WHERE lesson_id = (SELECT l_2026_id FROM test_fixtures) RETURNING lesson_id$$, 'T116: Student cannot UPDATE lesson_batches');
SELECT is_empty($$DELETE FROM public.lesson_batches WHERE lesson_id = (SELECT l_2026_id FROM test_fixtures) RETURNING lesson_id$$, 'T117: Student cannot DELETE lesson_batches');

-- announcements write denials
SELECT throws_ok($$INSERT INTO public.announcements (title, content, is_broadcast, created_by) VALUES ('Hacked Ann', 'Spam', true, (SELECT student_a_id FROM test_fixtures))$$, '42501', NULL, 'T118: Student cannot INSERT into announcements');
SELECT is_empty($$UPDATE public.announcements SET content = 'Defaced' WHERE id = (SELECT a_2026_id FROM test_fixtures) RETURNING id$$, 'T119: Student cannot UPDATE announcements');
SELECT is_empty($$DELETE FROM public.announcements WHERE id = (SELECT a_2026_id FROM test_fixtures) RETURNING id$$, 'T120: Student cannot DELETE announcements');

-- announcement_batches write denials
SELECT throws_ok($$INSERT INTO public.announcement_batches (announcement_id, batch_id) VALUES ((SELECT a_2027_id FROM test_fixtures), (SELECT b_2026_id FROM test_fixtures))$$, '42501', NULL, 'T121: Student cannot INSERT into announcement_batches');
SELECT is_empty($$UPDATE public.announcement_batches SET batch_id = (SELECT b_2027_id FROM test_fixtures) WHERE announcement_id = (SELECT a_2026_id FROM test_fixtures) RETURNING announcement_id$$, 'T122: Student cannot UPDATE announcement_batches');
SELECT is_empty($$DELETE FROM public.announcement_batches WHERE announcement_id = (SELECT a_2026_id FROM test_fixtures) RETURNING announcement_id$$, 'T123: Student cannot DELETE announcement_batches');

-- ─── 8. ORPHAN AUTH USER ISOLATION (T124 - T131) ─────────────────────────────

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', (SELECT orphan_id::text FROM test_fixtures), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT orphan_id::text FROM test_fixtures), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

SELECT is(public.is_teacher(), false, 'T124: Orphan user is_teacher returns false');
SELECT is(public.is_student(), false, 'T125: Orphan user is_student returns false');
SELECT is((SELECT count(*)::int FROM public.profiles), 0, 'T126: Orphan user cannot SELECT profiles');
SELECT is((SELECT count(*)::int FROM public.batches), 0, 'T127: Orphan user cannot SELECT batches');
SELECT is((SELECT count(*)::int FROM public.lessons), 0, 'T128: Orphan user cannot SELECT lessons');
SELECT is((SELECT count(*)::int FROM public.announcements), 0, 'T129: Orphan user cannot SELECT announcements');
SELECT is((SELECT count(*)::int FROM public.enrollments), 0, 'T130: Orphan user cannot SELECT enrollments');
SELECT throws_ok($$INSERT INTO public.batches (name, year) VALUES ('Orphan Batch', 2029)$$, '42501', NULL, 'T131: Orphan user cannot INSERT into batches');

-- ─── 9. ANONYMOUS ACCESS ZERO-ROW INVARIANTS (T132 - T138) ───────────────────

RESET ROLE;
SET LOCAL ROLE anon;

SELECT is((SELECT count(*)::int FROM public.profiles), 0, 'T132: anon SELECT profiles returns 0 rows');
SELECT is((SELECT count(*)::int FROM public.enrollments), 0, 'T133: anon SELECT enrollments returns 0 rows');
SELECT is((SELECT count(*)::int FROM public.batches), 0, 'T134: anon SELECT batches returns 0 rows');
SELECT is((SELECT count(*)::int FROM public.lessons), 0, 'T135: anon SELECT lessons returns 0 rows');
SELECT is((SELECT count(*)::int FROM public.lesson_batches), 0, 'T136: anon SELECT lesson_batches returns 0 rows');
SELECT is((SELECT count(*)::int FROM public.announcements), 0, 'T137: anon SELECT announcements returns 0 rows');
SELECT is((SELECT count(*)::int FROM public.announcement_batches), 0, 'T138: anon SELECT announcement_batches returns 0 rows');

-- ─── 10. CONCLUSION & ROLLBACK ───────────────────────────────────────────────

SELECT * FROM finish();
ROLLBACK;
