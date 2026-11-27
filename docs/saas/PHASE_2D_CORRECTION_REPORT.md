# Edvora Multi-Tenant SaaS — Phase 2D Correction & Finalization Report

> [!IMPORTANT]
> **AUDIT CLASSIFICATION**: FINAL PRE-DEPLOYMENT CORRECTION & STABILIZATION REPORT  
> **Status**: **`READY FOR CONTROLLED STAGING TEST`**  
> *(All identified database review corrections applied and statically validated; actual database validation and Phase 3 application adaptations required prior to production execution).*  
> **Execution Constraint Compliance**: ZERO SQL executed against production/staging databases; zero application source code modified; zero existing migrations modified.

---

## 1. Executive Summary

During the Phase 2C independent review, three specific database defects were identified in the prepared multi-tenant migration scripts:
1. **Quota Concurrency Race Condition (`00014`)**: `enforce_tenant_student_quota()` evaluated headcount without row-level locking, exposing the system to over-enrollment under concurrent load.
2. **Commercial Pricing Mismatch & Unfinalized Assumptions (`00013`)**: Seed pricing contained placeholder rates instead of the approved commercial figures (LKR 2,600 / 5,000 / 8,000), and annual pricing was non-nullable despite being commercially unfinalized.
3. **Data Backfill Brittleness (`00008`)**: The initial backfill used an `INNER JOIN auth.users` that risked dropping profiles lacking auth records (leading to subsequent foreign key failures), and assumed a single teacher existed without managing secondary teachers.

In this Phase 2D task, all three corrections were applied, verified, and integrated into the migration package. The database migration suite is now robust, concurrency-safe, and ready for disposable staging deployment.

---

## 2. Detailed Technical Corrections Applied

### Correction 1: Concurrency Serialization in Quota Enforcement (`00014`)
- **Target File**: [00014_subscription_enforcement_and_rls.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00014_subscription_enforcement_and_rls.sql)
- **Problem**: Time-of-Check to Time-of-Use (TOCTOU) race condition in `enforce_tenant_student_quota()`. Simultaneous enrollment inserts under `READ COMMITTED` isolation could both observe `count < limit`, resulting in over-enrollment beyond the tier quota.
- **Architectural Solution**:
  1. **Row-Level Exclusive Locking (`FOR UPDATE OF ts`)**: The trigger acquires an exclusive lock on the `tenant_subscriptions` row for the target `tenant_id` before evaluating the distinct student count.
  2. **Per-Tenant Serialization**: Concurrent enrollments for the *same tenant* are strictly serialized. Distinct tenants lock different rows and execute simultaneously without blocking.
  3. **Multi-Batch Deduplication**: The trigger checks whether the student is already enrolled in another batch within the same tenant. If so, `RETURN NEW` executes immediately without consuming an extra slot.
  4. **Update Support**: Extended trigger to `BEFORE INSERT OR UPDATE OF student_id, tenant_id ON public.enrollments`. If an update does not alter the student or tenant, the check is skipped.
- **Applied SQL Snippet**:
  ```sql
  SELECT ts.status, ts.current_period_end, ts.custom_student_limit, sp.max_students
  INTO v_sub
  FROM public.tenant_subscriptions ts
  JOIN public.subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = NEW.tenant_id
  FOR UPDATE OF ts; -- Row-level lock serializes enrollment headcount per tenant
  ```

---

### Correction 2: Approved Commercial Pricing & Configurable Nullable Fields (`00013`)
- **Target File**: [00013_subscription_and_commercial_billing.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00013_subscription_and_commercial_billing.sql)
- **Problem**: Seeded prices had placeholder values (LKR 3,000 / 6,000 / 12,000). Annual pricing was `NOT NULL`, which falsely represented unapproved annual discounts.
- **Architectural Solution**:
  1. **Approved Monthly Rates**: Seeded with Starter @ LKR 2,600.00, Growth @ LKR 5,000.00, Pro @ LKR 8,000.00.
  2. **Nullable Annual Pricing**: Altered column `price_lkr_annual NUMERIC(10,2) NULL CHECK (price_lkr_annual IS NULL OR price_lkr_annual > 0)` and seeded as `NULL` to accurately reflect that annual billing is unfinalized.
  3. **Provisional Technical Quotas**: Documented `max_students` (30, 100, 300) and `max_storage_bytes` (2GB, 10GB, 50GB) as provisional placeholders to satisfy constraints without finalizing business decisions.
  4. **Idempotency & Admin Preservation**: Maintained `ON CONFLICT (code) DO NOTHING;` to guarantee that subsequent migration runs or re-deployments never overwrite administrator-configured prices or limits.
- **Applied SQL Snippet**:
  ```sql
  INSERT INTO public.subscription_plans (
    code, name, description, price_lkr_monthly, price_lkr_annual, max_students, max_storage_bytes, sort_order
  ) VALUES
    ('starter', 'Starter Tuition', 'Solo tuition teachers.', 2600.00, NULL, 30, 2147483648, 10),
    ('growth',  'Growth Tuition',  'Expanding cohorts.',     5000.00, NULL, 100, 10737418240, 20),
    ('pro',     'Professional Academy', 'Large academies.',  8000.00, NULL, 300, 53687091200, 30)
  ON CONFLICT (code) DO NOTHING;
  ```

---

### Correction 3: Resilient Data Backfill & Legacy Multi-Teacher Handling (`00008`)
- **Target File**: [00008_backfill_default_tenant.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00008_backfill_default_tenant.sql)
- **Problem**:
  1. `INNER JOIN auth.users` omitted student profiles lacking matching auth records, which would trigger fatal foreign key violations in migration `00009` when enforcing `fk_enrollments_student_identity`.
  2. Single-teacher assumption (`LIMIT 1`) left secondary teacher accounts unassociated with any workspace.
- **Architectural Solution**:
  1. **Resilient `LEFT JOIN`**: Ensures every single student profile in `public.profiles` receives a matching record in `student_identities`.
  2. **Collision-Free Window Ranking**: Uses `ROW_NUMBER() OVER (PARTITION BY lower(...) ORDER BY p.created_at, p.id)` to guarantee that even if legacy data has case-insensitive username collisions, secondary profiles receive a disambiguated username (`username_xxxx`), satisfying `uq_idx_student_identities_lower_username`.
  3. **Preservation of Authentic Emails**: Real users with matching `auth.users` retain their exact existing email (`u.email`). Synthetic recovery emails (`student_uuid@edvora.internal`) are generated only for orphaned test profiles.
  4. **Secondary Teacher Association**: Automatically enrolls secondary teacher accounts as `instructor` in the primary workspace so they do not lose system access.
- **Applied SQL Snippet**:
  ```sql
  WITH student_candidates AS (
    SELECT
      p.id AS student_id,
      u.email AS auth_user_email,
      COALESCE(
        NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
        NULLIF(trim(split_part(u.email, '@', 1)), ''),
        'student_' || substr(p.id::text, 1, 8)
      ) AS raw_username,
      ROW_NUMBER() OVER (
        PARTITION BY lower(COALESCE(
          NULLIF(trim(u.raw_user_meta_data->>'username'), ''),
          NULLIF(trim(split_part(u.email, '@', 1)), ''),
          'student_' || substr(p.id::text, 1, 8)
        ))
        ORDER BY p.created_at ASC, p.id ASC
      ) AS disambiguation_rank
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'student'
  )
  INSERT INTO public.student_identities (tenant_id, student_id, username, auth_email)
  SELECT
    v_tenant_id,
    sc.student_id,
    CASE
      WHEN sc.disambiguation_rank = 1 THEN sc.raw_username
      ELSE sc.raw_username || '_' || substr(sc.student_id::text, 1, 4)
    END AS username,
    COALESCE(sc.auth_user_email, 'student_' || sc.student_id::text || '@edvora.internal') AS auth_email
  FROM student_candidates sc
  ON CONFLICT (tenant_id, student_id) DO NOTHING;
  ```

---

## 3. Subscription Expiry & Suspension Behavioral Matrix

To ensure clarity for application development, the database enforces the following operational behavior:

| Operation | Active Subscription | Expired Subscription | Suspended Subscription |
| :--- | :--- | :--- | :--- |
| **Student Reading Notes & Lessons** | **PERMITTED** | **PERMITTED** (Educational continuity) | **BLOCKED** if `tenants.is_active = false` |
| **Teacher Viewing Dashboard Roster** | **PERMITTED** | **PERMITTED** | **BLOCKED** if `tenants.is_active = false` |
| **Creating Batches / Lessons** | **PERMITTED** | **BLOCKED** (Trigger `55000`) | **BLOCKED** (Trigger `55000`) |
| **Uploading Study Notes to Storage** | **PERMITTED** | **BLOCKED** (RLS policy check) | **BLOCKED** (RLS policy check) |
| **Posting Announcements** | **PERMITTED** | **BLOCKED** (Trigger `55000`) | **BLOCKED** (Trigger `55000`) |
| **Enrolling New Students** | **PERMITTED** (Quota checked) | **BLOCKED** (Trigger `55000`) | **BLOCKED** (Trigger `55000`) |
| **Deleting / Archiving Resources** | **PERMITTED** | **PERMITTED** (Cleanup allowed) | **BLOCKED** |

---

## 4. Validation & Verification Log

### Tests Executed Locally (Static & Compiler)
- **TypeScript Typecheck**: Executed `npx tsc --noEmit` across the repository. Passed with **0 errors**.
- **Git Tree Cleanliness**: Verified zero modified files in `00001` through `00006`, zero modified files in `app/`, `components/`, or `lib/`.
- **SQL Parsing & Syntax Verification**: Verified all semicolon terminations, variable scoping, trigger hook bindings, and constraint naming.

### Tests Prepared for Staging Database Execution
The following 10 targeted test scenarios are staged inside the automated transaction block in [DATABASE_VALIDATION_PLAN.md](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/docs/saas/DATABASE_VALIDATION_PLAN.md):
1. **Concurrent Enrollment Serialization**: Row lock acquisition (`FOR UPDATE OF ts`) prevents over-enrollment when 1 slot remains.
2. **Duplicate Student Enrollment**: Enrolling an existing student in a second batch succeeds without incrementing unique headcount.
3. **Multi-Batch Enrollment**: Student appears in multiple batches while single quota slot is consumed.
4. **Missing Subscription Handling**: Enrollment in workspace with no subscription record throws clear exception `55000`.
5. **Expired Subscription Restriction**: Content mutation on expired workspace triggers exception `55000`.
6. **Suspended Subscription Restriction**: Content mutation on suspended workspace triggers exception `55000`.
7. **Unlinked Profile Backfill**: Student profile without `auth.users` row is mapped cleanly with synthetic identity.
8. **Cross-Tenant Username Isolation**: Student `kasun` in Tenant A and student `kasun` in Tenant B coexist without collision.
9. **Unauthorized Subscription Mutation**: Teacher attempting direct `UPDATE tenant_subscriptions` is rejected by RLS.
10. **Repeated Pricing Seed Idempotency**: Executing `00013` seed repeatedly does not overwrite existing records.

---

## 5. Updated Status & Next Steps

### Status: **`READY FOR CONTROLLED STAGING TEST`**

The database migration package (`00007` to `00014`) is fully corrected and ready to be tested against a disposable staging database. 

**Application Deployment Notice**:
Before these migrations can be executed against a staging environment connected to the live web application, the Phase 3 application code adaptations (passing `tenant_id` in Server Actions, tenant-scoped student login resolution, and private storage signed URL generation) must be implemented.
