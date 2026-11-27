# Edvora Multi-Tenant SaaS — Database Rollback & Forward Recovery Plan

> [!CAUTION]
> **HIGH RISK OPERATION**:  
> In a multi-tenant production environment where more than one teacher workspace has been created, rolling back to single-tenant schemas or policies will **permanently destroy customer data** and **expose cross-tenant records**.  
> **Standard Policy**: Always prefer **Safe Forward Recovery** over database rollback.

---

## 1. Rollback vs Forward Recovery Policy

| Scenario | Recommended Strategy | Reason |
| :--- | :--- | :--- |
| **Pre-Production Staging Failure** | Step-by-Step Rollback Script | No external customer data present; clean schema reset is safe. |
| **Migration Failure During Staged Window** | Immediate Transaction Abort | Migrations run inside `BEGIN; ... COMMIT;` blocks; failed transaction rolls back cleanly with zero changes persisted. |
| **Post-Deployment Production Bug** | **Safe Forward Recovery** | Multiple teachers and students exist. Dropping `tenant_id` or reverting to `public.is_teacher()` causes catastrophic cross-tenant data leaks. |

---

## 2. Destructive Operations & Data Loss Risks

| Operation | Risk Level | Data Impact |
| :--- | :--- | :--- |
| `DROP TABLE public.tenants CASCADE` | **CATASTROPHIC** | Deletes all workspace configurations, custom quotas, and subscription ties. |
| `DROP TABLE public.tenant_subscriptions` | **CATASTROPHIC** | Deletes commercial billing histories, payment verifications, and subscription periods. |
| `ALTER TABLE ... DROP COLUMN tenant_id` | **DESTRUCTIVE** | Discards tenant ownership on all batches, lessons, notes, and announcements. If Tenant B exists, their records become untraceable orphans. |
| `Restoring public.is_teacher()` | **SECURITY LEAK** | Allows any authenticated teacher to view and modify all other teachers' profiles and resources. |

---

## 3. Automated Rollback Guard & Safe Script

This rollback script includes an automated guard that **aborts execution immediately** if more than one tenant exists in the database.

```sql
BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SAFETY GUARD: PREVENT CROSS-TENANT DATA CORRUPTION & DATA EXPOSURE
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
    SELECT count(*) INTO v_tenant_count FROM public.tenants;
    IF v_tenant_count > 1 THEN
      RAISE EXCEPTION 'CRITICAL SECURITY ABORT: Multiple tenants (%) exist in the database. Rolling back would cause catastrophic cross-tenant data leakage and data loss. Aborting rollback. Execute Safe Forward Recovery instead.',
        v_tenant_count
        USING ERRCODE = '55000';
    END IF;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ROLLBACK 00014 & 00013 (SUBSCRIPTION ARCHITECTURE)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_student_quota ON public.enrollments;
DROP TRIGGER IF EXISTS trg_sub_active_batches ON public.batches;
DROP TRIGGER IF EXISTS trg_sub_active_lessons ON public.lessons;
DROP TRIGGER IF EXISTS trg_sub_active_notes ON public.notes;
DROP TRIGGER IF EXISTS trg_sub_active_announcements ON public.announcements;

DROP FUNCTION IF EXISTS public.enforce_tenant_student_quota();
DROP FUNCTION IF EXISTS public.enforce_active_subscription_for_mutations();
DROP FUNCTION IF EXISTS public.admin_verify_subscription_payment(UUID, BOOLEAN, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.get_tenant_quota_summary(UUID);
DROP FUNCTION IF EXISTS public.is_tenant_subscription_active(UUID);
DROP FUNCTION IF EXISTS public.is_platform_admin();

DROP TABLE IF EXISTS public.subscription_history CASCADE;
DROP TABLE IF EXISTS public.subscription_payments CASCADE;
DROP TABLE IF EXISTS public.tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.platform_admins CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: ROLLBACK 00012 (STORAGE TENANT POLICIES)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "notes_storage_upload_tenant" ON storage.objects;
DROP POLICY IF EXISTS "notes_storage_manage_tenant" ON storage.objects;
DROP POLICY IF EXISTS "notes_storage_select_tenant" ON storage.objects;
DROP FUNCTION IF EXISTS public.try_cast_uuid(TEXT);

-- Reset notes bucket back to previous state if solely single-tenant
UPDATE storage.buckets SET public = true WHERE id = 'notes';

CREATE POLICY "teacher_upload_notes_storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notes' AND public.is_teacher());

CREATE POLICY "teacher_manage_notes_storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'notes' AND public.is_teacher())
  WITH CHECK (bucket_id = 'notes' AND public.is_teacher());

CREATE POLICY "authenticated_read_notes_storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notes');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: ROLLBACK 00011 (MULTI-TENANT RLS POLICIES)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tenants_select_authorized"            ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_owner"                 ON public.tenants;
DROP POLICY IF EXISTS "tenants_delete_owner"                 ON public.tenants;

DROP POLICY IF EXISTS "tenant_members_select_member"         ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_insert_admin"          ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_update_admin"          ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_delete_admin"          ON public.tenant_members;

DROP POLICY IF EXISTS "student_identities_select"            ON public.student_identities;
DROP POLICY IF EXISTS "student_identities_insert_admin"      ON public.student_identities;
DROP POLICY IF EXISTS "student_identities_update_admin"      ON public.student_identities;
DROP POLICY IF EXISTS "student_identities_delete_admin"      ON public.student_identities;

DROP POLICY IF EXISTS "batches_select_staff"                 ON public.batches;
DROP POLICY IF EXISTS "batches_select_student"               ON public.batches;
DROP POLICY IF EXISTS "batches_insert_instructor"            ON public.batches;
DROP POLICY IF EXISTS "batches_update_instructor"            ON public.batches;
DROP POLICY IF EXISTS "batches_delete_admin"                 ON public.batches;

DROP POLICY IF EXISTS "lessons_select_staff"                 ON public.lessons;
DROP POLICY IF EXISTS "lessons_select_student"               ON public.lessons;
DROP POLICY IF EXISTS "lessons_insert_instructor"            ON public.lessons;
DROP POLICY IF EXISTS "lessons_update_instructor"            ON public.lessons;
DROP POLICY IF EXISTS "lessons_delete_instructor"            ON public.lessons;

DROP POLICY IF EXISTS "lesson_batches_select_staff"          ON public.lesson_batches;
DROP POLICY IF EXISTS "lesson_batches_select_student"        ON public.lesson_batches;
DROP POLICY IF EXISTS "lesson_batches_manage_instructor"     ON public.lesson_batches;

DROP POLICY IF EXISTS "notes_select_staff"                   ON public.notes;
DROP POLICY IF EXISTS "notes_select_student"                 ON public.notes;
DROP POLICY IF EXISTS "notes_insert_instructor"              ON public.notes;
DROP POLICY IF EXISTS "notes_update_instructor"              ON public.notes;
DROP POLICY IF EXISTS "notes_delete_instructor"              ON public.notes;

DROP POLICY IF EXISTS "note_batches_select_staff"            ON public.note_batches;
DROP POLICY IF EXISTS "note_batches_select_student"          ON public.note_batches;
DROP POLICY IF EXISTS "note_batches_manage_instructor"       ON public.note_batches;

DROP POLICY IF EXISTS "announcements_select_staff"           ON public.announcements;
DROP POLICY IF EXISTS "announcements_select_student"         ON public.announcements;
DROP POLICY IF EXISTS "announcements_insert_assistant"       ON public.announcements;
DROP POLICY IF EXISTS "announcements_update_assistant"       ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete_instructor"      ON public.announcements;

DROP POLICY IF EXISTS "announcement_batches_select_staff"    ON public.announcement_batches;
DROP POLICY IF EXISTS "announcement_batches_select_student"  ON public.announcement_batches;
DROP POLICY IF EXISTS "announcement_batches_manage_assistant" ON public.announcement_batches;

DROP POLICY IF EXISTS "enrollments_select_staff"             ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_select_student"           ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_insert_admin"             ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_update_admin"             ON public.enrollments;
DROP POLICY IF EXISTS "enrollments_delete_admin"             ON public.enrollments;

DROP POLICY IF EXISTS "profiles_select_self"                 ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_tenant_staff"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"                 ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_tenant_admin"         ON public.profiles;

-- Restore single-tenant policies ONLY if single teacher exists
CREATE POLICY "teacher_full_profiles" ON public.profiles FOR ALL USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_own_profile" ON public.profiles FOR SELECT USING (auth.uid() = id AND NOT public.is_teacher());
CREATE POLICY "teacher_full_batches" ON public.batches FOR ALL USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_own_batch" ON public.batches FOR SELECT USING (public.is_enrolled_in_batch(id) AND is_archived = false AND NOT public.is_teacher());
CREATE POLICY "teacher_full_lessons" ON public.lessons FOR ALL USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_batch_lessons" ON public.lessons FOR SELECT USING (NOT public.is_teacher() AND EXISTS (SELECT 1 FROM public.lesson_batches lb WHERE lb.lesson_id = lessons.id AND public.is_enrolled_in_batch(lb.batch_id)));
CREATE POLICY "teacher_full_lesson_batches" ON public.lesson_batches FOR ALL USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_batch_lesson_batches" ON public.lesson_batches FOR SELECT USING (public.is_enrolled_in_batch(batch_id) AND NOT public.is_teacher());
CREATE POLICY "teacher_all_notes" ON public.notes FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_select_enrolled_notes" ON public.notes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.note_batches nb JOIN public.enrollments e ON nb.batch_id = e.batch_id WHERE nb.note_id = notes.id AND e.student_id = auth.uid()));
CREATE POLICY "teacher_all_note_batches" ON public.note_batches FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_select_enrolled_note_batches" ON public.note_batches FOR SELECT TO authenticated USING (public.is_enrolled_in_batch(batch_id));
CREATE POLICY "teacher_full_announcements" ON public.announcements FOR ALL USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_batch_announcements" ON public.announcements FOR SELECT USING (NOT public.is_teacher() AND (NOT EXISTS (SELECT 1 FROM public.announcement_batches ab WHERE ab.announcement_id = announcements.id) OR EXISTS (SELECT 1 FROM public.announcement_batches ab WHERE ab.announcement_id = announcements.id AND public.is_enrolled_in_batch(ab.batch_id))));
CREATE POLICY "teacher_full_announcement_batches" ON public.announcement_batches FOR ALL USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "student_batch_announcement_batches" ON public.announcement_batches FOR SELECT USING (public.is_enrolled_in_batch(batch_id) AND NOT public.is_teacher());
CREATE POLICY "enrollments_teacher_all" ON public.enrollments FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "enrollments_student_read" ON public.enrollments FOR SELECT TO authenticated USING (student_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: ROLLBACK 00010 (AUTH HELPER FUNCTIONS)
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.transfer_tenant_ownership(UUID, UUID);
DROP FUNCTION IF EXISTS public.create_tenant_workspace(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.is_enrolled_in_tenant_batch(UUID);
DROP FUNCTION IF EXISTS public.is_tenant_student(UUID);
DROP FUNCTION IF EXISTS public.has_tenant_role(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_my_tenant_role(UUID);
DROP FUNCTION IF EXISTS public.get_auth_tenant_ids();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: ROLLBACK 00009 (SCOPING & COMPOSITE INTEGRITY)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lesson_batches       DROP CONSTRAINT IF EXISTS fk_lb_lesson_tenant;
ALTER TABLE public.lesson_batches       DROP CONSTRAINT IF EXISTS fk_lb_batch_tenant;
ALTER TABLE public.note_batches         DROP CONSTRAINT IF EXISTS fk_nb_note_tenant;
ALTER TABLE public.note_batches         DROP CONSTRAINT IF EXISTS fk_nb_batch_tenant;
ALTER TABLE public.announcement_batches DROP CONSTRAINT IF EXISTS fk_ab_announcement_tenant;
ALTER TABLE public.announcement_batches DROP CONSTRAINT IF EXISTS fk_ab_batch_tenant;
ALTER TABLE public.enrollments          DROP CONSTRAINT IF EXISTS fk_enrollments_batch_tenant;
ALTER TABLE public.enrollments          DROP CONSTRAINT IF EXISTS fk_enrollments_student_identity;

ALTER TABLE public.batches       DROP CONSTRAINT IF EXISTS uq_batches_id_tenant;
ALTER TABLE public.lessons       DROP CONSTRAINT IF EXISTS uq_lessons_id_tenant;
ALTER TABLE public.notes         DROP CONSTRAINT IF EXISTS uq_notes_id_tenant;
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS uq_announcements_id_tenant;

DROP INDEX IF EXISTS public.uq_batches_tenant_name;
ALTER TABLE public.batches ADD CONSTRAINT batches_name_key UNIQUE (name);

DROP INDEX IF EXISTS public.idx_batches_tenant_id;
DROP INDEX IF EXISTS public.idx_lessons_tenant_id;
DROP INDEX IF EXISTS public.idx_notes_tenant_id;
DROP INDEX IF EXISTS public.idx_announcements_tenant_id;
DROP INDEX IF EXISTS public.idx_enrollments_tenant_id;
DROP INDEX IF EXISTS public.idx_lesson_batches_tenant;
DROP INDEX IF EXISTS public.idx_note_batches_tenant;
DROP INDEX IF EXISTS public.idx_ann_batches_tenant;

ALTER TABLE public.batches              DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.lessons              DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.notes                DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.announcements        DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.enrollments          DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.lesson_batches       DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.note_batches         DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.announcement_batches DROP COLUMN IF EXISTS tenant_id;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: ROLLBACK 00008 & 00007 (CORE INFRASTRUCTURE)
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.student_identities CASCADE;
DROP TABLE IF EXISTS public.tenant_members CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

DROP FUNCTION IF EXISTS public.protect_tenant_slug();
DROP FUNCTION IF EXISTS public.check_tenant_member_safety();

COMMIT;
```

---

## 4. Safe Forward-Recovery Procedures

If a logic defect or performance regression is identified post-migration:
1. **Never Drop `tenant_id` or Relax Policies**: Keep multi-tenant RLS active.
2. **Hotfix Migration File**: Create an incremental migration (e.g., `00015_hotfix_...sql`) that adjusts the specific policy, trigger, or function.
3. **Emergency Lockdown Procedure**:
   If an active security breach is detected, lock down writes for that specific tenant rather than rolling back the entire database:
   ```sql
   UPDATE public.tenant_subscriptions
   SET status = 'suspended'
   WHERE tenant_id = '<target_tenant_id>';
   ```
   This immediately halts all resource mutations and file uploads for that tenant via `enforce_active_subscription_for_mutations`.
