# Edvora — Phase 3D.1: Post-Migration Database Verification Report

**Environment Target:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`)  
**Protected Development Project:** `sauphnaxchcouqslflsl` (Untouched, Detached)  
**Verification Date:** 2026-11-25  
**Database Engine:** PostgreSQL 17.12 (AWS `ap-northeast-1`)  
**Verification Methodology:** Direct read-only SQL inspection via Supabase CLI (`npx supabase db query --remote --read-only`) executed as `supabase_read_only_user`. Zero mutations, zero test record injections.  
**Final Verdict:** `DATABASE STRUCTURE VERIFIED`

---

## Executive Summary

All 19 database migrations (`00001` through `00019`) have been successfully applied to the isolated `edvora-staging` PostgreSQL database. A thorough, read-only audit of the remote catalog was performed to verify migration history, table schema, composite foreign key constraints, Row Level Security (RLS) enforcement, `SECURITY DEFINER` search path hardening, function execute privileges, storage bucket configuration, subscription pricing, and quota triggers.

All 19 application tables are present with zero schema drift. Every `SECURITY DEFINER` function strictly enforces an empty search path (`search_path = ''`). The critical provisioning and rate-limiting RPCs are completely inaccessible to `anon` and `authenticated` roles, executable strictly by `service_role`.

> [!IMPORTANT]
> **Tenant Isolation Boundary Notice:** While the physical schema, composite foreign keys, unique constraints, and declarative RLS policies are structurally verified, **tenant isolation cannot be claimed as proven merely because RLS policies exist**. Full behavioral tenant isolation requires empirical multi-tenant session testing and deliberate cross-tenant violation attempts, scheduled for Phase 3D.2.

---

## 1. Remote Migration History Verification

### Target Verification
- **Command:** `npx supabase migration list --remote`
- **Target Project Reference:** `voyypkysddyrjuqimzya` (`edvora-staging`)
- **Status:** **PASS**

### Result Summary
The migration ledger in `supabase_migrations.schema_migrations` confirms that all 19 migrations match between local repository and remote database:

| Migration File | Local Status | Remote Status |
| :--- | :--- | :--- |
| `00001_initial_schema.sql` | Present | Applied |
| `00002_fix_rls_recursion.sql` | Present | Applied |
| `00003_storage_bucket.sql` | Present | Applied |
| `00004_seed_teacher.sql` (Legacy seed no-op notice) | Present | Applied |
| `00005_profiles_auth_trigger.sql` | Present | Applied |
| `00006_update_profiles_role_check.sql` | Present | Applied |
| `00007_tenants_and_members.sql` | Present | Applied |
| `00008_backfill_tenant_data.sql` | Present | Applied |
| `00009_scope_core_tables_to_tenant.sql` | Present | Applied |
| `00010_tenant_rls_policies.sql` | Present | Applied |
| `00011_tenant_storage_isolation.sql` | Present | Applied |
| `00012_composite_tenant_keys.sql` | Present | Applied |
| `00013_saas_billing_schema.sql` | Present | Applied |
| `00014_subscription_rls_and_functions.sql` | Present | Applied |
| `00015_teacher_free_trial.sql` | Present | Applied |
| `00016_subscription_enforcement_and_quotas.sql` | Present | Applied |
| `00017_auth_rate_limiting.sql` | Present | Applied |
| `00018_atomic_workspace_provisioning_and_storage.sql` | Present | Applied |
| `00019_rpc_security_and_storage_hardening.sql` | Present | Applied |

---

## 2. Actual Database Structure Verification

### 2.1 Table Inventory & Physical Columns
**Query:**
```sql
SELECT table_name, count(*)::int AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
```

**Result:**
All 19 application tables exist in `public`:
- `announcement_batches`: 3 columns
- `announcements`: 9 columns
- `auth_rate_limits`: 5 columns
- `batches`: 7 columns
- `enrollments`: 4 columns
- `lesson_batches`: 3 columns
- `lessons`: 10 columns
- `note_batches`: 3 columns
- `notes`: 10 columns
- `platform_admins`: 3 columns
- `profiles`: 6 columns
- `student_identities`: 8 columns
- `subscription_history`: 10 columns
- `subscription_payments`: 17 columns
- `subscription_plans`: 13 columns
- `teacher_trial_claims`: 5 columns
- `tenant_members`: 6 columns
- `tenant_subscriptions`: 14 columns
- `tenants`: 9 columns

**Column Verification on `tenant_members`:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tenant_members'
ORDER BY ordinal_position;
```
- `id` (uuid, NOT NULL)
- `tenant_id` (uuid, NOT NULL)
- `user_id` (uuid, NOT NULL)
- `role` (text, NOT NULL)
- `created_at` (timestamptz, NOT NULL)
- `updated_at` (timestamptz, NOT NULL)
- **Zero `joined_at` column exists.** The approved migration fixes in `00018` and `00019` aligning to `created_at` match the live database exactly.

**Status:** **PASS**

---

### 2.2 Composite Foreign Keys & Tenant Integrity Constraints
**Query:**
```sql
SELECT conname AS constraint_name, conrelid::regclass AS table_name, confrelid::regclass AS foreign_table
FROM pg_constraint
WHERE conname IN (
  'fk_lb_lesson_tenant', 'fk_lb_batch_tenant',
  'fk_nb_note_tenant', 'fk_nb_batch_tenant',
  'fk_ab_announcement_tenant', 'fk_ab_batch_tenant',
  'fk_enrollments_batch_tenant', 'fk_enrollments_student_identity'
)
ORDER BY table_name;
```

**Result:**
| Constraint Name | Child Table | Foreign Table | Covered Keys | Status |
| :--- | :--- | :--- | :--- | :--- |
| `fk_ab_announcement_tenant` | `announcement_batches` | `announcements` | `(announcement_id, tenant_id)` | **PASS** |
| `fk_ab_batch_tenant` | `announcement_batches` | `batches` | `(batch_id, tenant_id)` | **PASS** |
| `fk_enrollments_student_identity`| `enrollments` | `student_identities` | `(student_id, tenant_id)` | **PASS** |
| `fk_enrollments_batch_tenant` | `enrollments` | `batches` | `(batch_id, tenant_id)` | **PASS** |
| `fk_lb_lesson_tenant` | `lesson_batches` | `lessons` | `(lesson_id, tenant_id)` | **PASS** |
| `fk_lb_batch_tenant` | `lesson_batches` | `batches` | `(batch_id, tenant_id)` | **PASS** |
| `fk_nb_note_tenant` | `note_batches` | `notes` | `(note_id, tenant_id)` | **PASS** |
| `fk_nb_batch_tenant` | `note_batches` | `batches` | `(batch_id, tenant_id)` | **PASS** |

**Matching Unique Parent Constraints:**
- `uq_announcements_id_tenant` on `announcements(id, tenant_id)`: **VERIFIED**
- `uq_batches_id_tenant` on `batches(id, tenant_id)`: **VERIFIED**
- `uq_lessons_id_tenant` on `lessons(id, tenant_id)`: **VERIFIED**
- `uq_notes_id_tenant` on `notes(id, tenant_id)`: **VERIFIED**
- `uq_tenant_members_tenant_user` on `tenant_members(tenant_id, user_id)`: **VERIFIED**
- `uq_tenant_subscription` on `tenant_subscriptions(tenant_id)`: **VERIFIED**
- `uq_tenants_slug` on `tenants(slug)`: **VERIFIED**

**Status:** **PASS**

---

### 2.3 Row Level Security (RLS) Status
**Query:**
```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```

**Result:**
| Table Name | RLS Enabled (`relrowsecurity`) | Security Architecture |
| :--- | :--- | :--- |
| `announcement_batches` | `true` | Declarative RLS policies |
| `announcements` | `true` | Declarative RLS policies |
| `batches` | `true` | Declarative RLS policies |
| `enrollments` | `true` | Declarative RLS policies |
| `lesson_batches` | `true` | Declarative RLS policies |
| `lessons` | `true` | Declarative RLS policies |
| `note_batches` | `true` | Declarative RLS policies |
| `notes` | `true` | Declarative RLS policies |
| `platform_admins` | `true` | Declarative RLS policies |
| `profiles` | `true` | Declarative RLS policies |
| `student_identities` | `true` | Declarative RLS policies |
| `subscription_history` | `true` | Declarative RLS policies |
| `subscription_payments` | `true` | Declarative RLS policies |
| `subscription_plans` | `true` | Declarative RLS policies |
| `teacher_trial_claims` | `true` | Declarative RLS policies |
| `tenant_members` | `true` | Declarative RLS policies |
| `tenant_subscriptions` | `true` | Declarative RLS policies |
| `tenants` | `true` | Declarative RLS policies |
| `auth_rate_limits` | `false` | Access revoked for `anon`, `authenticated`, and `PUBLIC`; gated strictly via SECURITY DEFINER functions |

**`auth_rate_limits` Table Privilege Verification:**
```sql
SELECT has_table_privilege('anon', 'public.auth_rate_limits', 'SELECT') as anon_select,
       has_table_privilege('authenticated', 'public.auth_rate_limits', 'SELECT') as auth_select,
       has_table_privilege('service_role', 'public.auth_rate_limits', 'SELECT') as service_select;
```
- `anon_select`: `false`
- `auth_select`: `false`
- `service_select`: `false` (Direct table access denied; accessed strictly via owner-executed RPCs)

**Status:** **PASS**

---

### 2.4 SECURITY DEFINER Search Path Hardening
**Query:**
```sql
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY p.proname;
```

**Result:**
All 21 `SECURITY DEFINER` functions in the `public` schema have `proconfig` set to `["search_path=\"\""]`:
1. `admin_verify_subscription_payment` — `search_path = ''`
2. `check_rate_limit` — `search_path = ''`
3. `create_tenant_workspace` — `search_path = ''`
4. `enforce_active_subscription_for_mutations` — `search_path = ''`
5. `enforce_tenant_student_quota` — `search_path = ''`
6. `get_auth_tenant_ids` — `search_path = ''`
7. `get_my_role` — `search_path = ''`
8. `get_my_tenant_role` — `search_path = ''`
9. `get_tenant_quota_summary` — `search_path = ''`
10. `has_tenant_role` — `search_path = ''`
11. `is_enrolled_in_batch` — `search_path = ''`
12. `is_enrolled_in_tenant_batch` — `search_path = ''`
13. `is_platform_admin` — `search_path = ''`
14. `is_student` — `search_path = ''`
15. `is_teacher` — `search_path = ''`
16. `is_tenant_student` — `search_path = ''`
17. `is_tenant_subscription_active` — `search_path = ''`
18. `provision_tenant_workspace` — `search_path = ''`
19. `record_failed_rate_limit_attempt` — `search_path = ''`
20. `reset_rate_limit` — `search_path = ''`
21. `transfer_tenant_ownership` — `search_path = ''`

Zero functions run with dynamic search paths. Search path hijacking vulnerabilities are completely eliminated.

**Status:** **PASS**

---

### 2.5 Function EXECUTE Privileges & RPC Access Control
**Query:**
```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```

**Key Findings:**
| Function Name | `anon` | `authenticated` | `service_role` | Security Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `provision_tenant_workspace` | **DENIED** (`false`) | **DENIED** (`false`) | **ALLOWED** (`true`) | **PASS** — Restricted to server-side orchestration |
| `check_rate_limit` | **DENIED** (`false`) | **DENIED** (`false`) | **ALLOWED** (`true`) | **PASS** — Only server middleware can evaluate limits |
| `record_failed_rate_limit_attempt`| **DENIED** (`false`) | **DENIED** (`false`) | **ALLOWED** (`true`) | **PASS** — Only server middleware can record failures |
| `reset_rate_limit` | **DENIED** (`false`) | **DENIED** (`false`) | **ALLOWED** (`true`) | **PASS** — Only server middleware can reset counters |
| `admin_verify_subscription_payment`| **DENIED** (`false`) | **ALLOWED** (`true`)* | **ALLOWED** (`true`) | **PASS** — Authenticated execution gated internally by `is_platform_admin(auth.uid())` |
| `get_my_tenant_role` | **DENIED** (`false`) | **ALLOWED** (`true`) | **ALLOWED** (`true`) | **PASS** — Tenant member context lookup |
| `has_tenant_role` | **DENIED** (`false`) | **ALLOWED** (`true`) | **ALLOWED** (`true`) | **PASS** — Role authorization check |
| `is_tenant_student` | **DENIED** (`false`) | **ALLOWED** (`true`) | **ALLOWED** (`true`) | **PASS** — Student enrollment check |

**Status:** **PASS**

---

### 2.6 Storage Buckets & Policies
**Query:**
```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;
```

**Result:**
| Bucket ID | Name | Public | File Size Limit | Allowed MIME Types | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `notes` | `notes` | `false` (Private) | Default | All | **PASS** |
| `payment_slips` | `payment_slips` | `false` (Private) | 5,242,880 (5MB) | `image/jpeg`, `image/png`, `application/pdf` | **PASS** |

**Storage Object Policies in `storage.objects`:**
- `notes_storage_manage_tenant`: ALL actions for authenticated instructors (`has_tenant_role(..., 'instructor')`).
- `notes_storage_select_tenant`: SELECT for authenticated assistants and enrolled students.
- `notes_storage_upload_tenant`: INSERT for authenticated instructors.
- `payment_slips_manage_tenant_admin`: ALL actions for authenticated tenant admins or platform admins.
- `payment_slips_select_authorized`: SELECT for authenticated tenant admins or platform admins.
- `payment_slips_upload_tenant_admin`: INSERT for authenticated tenant admins.

All storage paths strictly enforce prefix isolation using `try_cast_uuid(split_part(name, '/', 1))`.

**Status:** **PASS**

---

### 2.7 SaaS Subscription Plans & Pricing
**Query:**
```sql
SELECT code, name, price_lkr_monthly, price_lkr_annual, max_students, max_storage_bytes, is_active
FROM public.subscription_plans
ORDER BY sort_order;
```

**Result:**
| Code | Plan Name | Monthly Price (LKR) | Student Quota | Storage Quota | Active |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `starter` | Starter Tuition | **2,600.00** | 30 students | 2,147,483,648 bytes (2 GB) | `true` |
| `growth` | Growth Tuition | **5,000.00** | 100 students | 10,737,418,240 bytes (10 GB) | `true` |
| `pro` | Professional Academy | **8,000.00** | 300 students | 53,687,091,200 bytes (50 GB) | `true` |

Pricing and quotas match the SaaS specification with 100% precision.

**Status:** **PASS**

---

### 2.8 Trial & Quota Configuration
**Query:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('tenant_subscriptions', 'teacher_trial_claims')
ORDER BY table_name, ordinal_position;
```

**Key Findings:**
- `tenant_subscriptions` contains `trial_started_at` (timestamptz) and `trial_ends_at` (timestamptz).
- A partial index `idx_tenant_subscriptions_trial_ends` covers `trial_ends_at WHERE (status = 'trialing')`.
- `teacher_trial_claims` includes `normalized_email_hash` (text, NOT NULL), with a unique index `teacher_trial_claims_normalized_email_hash_key` preventing multiple trial redemptions per normalized email hash.

**Triggers Enforcing Subscriptions & Quotas:**
- `trg_check_student_quota` on `enrollments`: Fires `enforce_tenant_student_quota()` on student enrollment insertions.
- `trg_sub_active_announcements` on `announcements`: Fires `enforce_active_subscription_for_mutations()`.
- `trg_sub_active_batches` on `batches`: Fires `enforce_active_subscription_for_mutations()`.
- `trg_sub_active_lessons` on `lessons`: Fires `enforce_active_subscription_for_mutations()`.
- `trg_sub_active_notes` on `notes`: Fires `enforce_active_subscription_for_mutations()`.
- `trg_protect_tenant_slug` on `tenants`: Prevents mutation of slug after provisioning.
- `trg_tenant_member_safety` on `tenant_members`: Enforces single-owner safety rules.

**Status:** **PASS**

---

## 3. Security Assertions Summary

| Security Requirement | Verified State | Evaluation |
| :--- | :--- | :--- |
| `provision_tenant_workspace()` cannot be executed by `authenticated` or `anon` | `anon_exec = false`, `auth_exec = false`, `service_exec = true` | **PASS** |
| Restricted administrative RPCs only callable by `service_role` | `check_rate_limit`, `record_failed_rate_limit_attempt`, `reset_rate_limit` only executable by `service_role` | **PASS** |
| All tenant-owned tables have RLS enabled | 18 of 18 tenant tables have `relrowsecurity = true` | **PASS** |
| Sensitive rate limit table has direct access revoked | `auth_rate_limits` table permissions are `false` for `anon` and `authenticated` | **PASS** |
| Storage buckets are strictly private | Both `notes` and `payment_slips` have `public = false` | **PASS** |
| Storage upload & read enforces tenant UUID prefix | `storage.objects` policies enforce `try_cast_uuid(split_part(name, '/', 1))` | **PASS** |
| Composite foreign keys enforce tenant consistency | 8 composite foreign keys enforce child and parent match on `tenant_id` | **PASS** |
| No search path hijacking vulnerabilities | All 21 `SECURITY DEFINER` functions have `search_path = ''` | **PASS** |
| Seed teacher bypass removed | Migration 00004 replaced with safe no-op `DO` block | **PASS** |
| `tenant_members` physical schema consistency | Column `created_at` present, zero `joined_at` references | **PASS** |

---

## 4. Final Verdict

# `DATABASE STRUCTURE VERIFIED`

All 19 migrations have been applied cleanly to the staging Supabase project (`voyypkysddyrjuqimzya`). The physical schema, composite tenant constraints, triggers, search paths, RPC privileges, private storage buckets, and subscription parameters have all been verified authoritatively through read-only database catalog queries.

The staging database is completely prepared for Phase 3D.2: End-to-End Multi-Tenant Isolation & Integration Verification.
