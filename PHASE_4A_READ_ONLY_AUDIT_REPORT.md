# Edvora — Phase 4A: Preflight Read-Only Audit Report
## Admin-Approved Teacher Onboarding, Separate Portals, GitHub Update & Staging Deployment

**Audit Date:** 2026-11-27  
**Environment Target:** Staging (`edvora-staging` / `voyypkysddyrjuqimzya`)  
**Protected Development Project:** `sauphnaxchcouqslflsl` (Strictly untouched & detached)  
**Current Git Branch:** `main` (commit `434512d`)  
**Git Remote:** `origin` (`https://github.com/sithija-ws/EDVORA-Learning-Portal.git`)  
**Phase Status:** **PHASE A — READ-ONLY AUDIT COMPLETE (AWAITING USER APPROVAL FOR PHASE B)**

---

## 1. Executive Summary

This read-only audit inspects the current repository state, database schema, routing architecture, and deployment configurations in preparation for **Phase 4A: Admin-Approved Teacher Onboarding, Separate Portals, GitHub Update & Staging Deployment**.

### Key Findings
1. **Repository & Working Tree State:**
   - The repository is on `main`, synchronized with `origin/main` at commit `434512d`.
   - The working directory contains uncommitted Phase 3 multi-tenant foundations (38 modified files and 27 untracked files including migrations `00007`–`00019`, `actions/subscriptions.ts`, `app/(auth)/register`, `lib/auth/*`, and the 74 passing unit/contract tests).
   - Per Phase 4A mandates, a dedicated feature branch `feature/admin-approved-teacher-onboarding` must be created to bundle these foundations with the Phase 4A implementation before pushing to GitHub.
   - `.gitignore` properly isolates `.env*` (except `.env.example` and `.env.staging.example`) and `.vercel`.

2. **Existing Staging Test Accounts (Phase 3D.2.3):**
   - Two staging teacher identities exist in `auth.users` and `public.profiles`:
     - **Teacher A:** `sithijax2@gmail.com` (User ID: `645a496d-5bc7-4052-98bd-ef93e50e0da2`, Full Name: `Teacher Alpha`, Slug: `academy-alpha`)
     - **Teacher B:** `sithija.ws@gmail.com` (User ID: `d3624259-29e8-4b3f-ad29-d8ec51962796`, Full Name: `Teacher Beta`, Slug: `academy-beta`)
   - Both accounts have `email_confirmed_at = NULL`.
   - Neither account has a provisioned workspace (`public.tenants` has 0 rows, `tenant_members` has 0 rows, `tenant_subscriptions` has 0 rows, `teacher_trial_claims` has 0 rows).
   - Under Phase 4A, these accounts will be backfilled/migrated as pending teacher applications in the new `teacher_applications` table, providing immediate real test data for the Admin Dashboard.

3. **Current Routing Architecture:**
   - Currently, login is unified at `/login`, student home is at `/home`, teacher dashboard is at `/dashboard`, and teacher self-registration is at `/register`.
   - Phase 4A introduces three dedicated portals:
     - **Teacher Portal:** `/teacher/login`, `/teacher/register`, `/teacher/dashboard`.
     - **Student Portal:** `/student/login`, `/home/...` (with backward compatibility for `/login`).
     - **Platform Admin Portal:** `/admin/login`, `/admin/dashboard`.
   - Edge `middleware.ts` must be extended to support the three portals, handle role routing, and enforce strict access boundaries.

4. **Database & Authorization Architecture:**
   - Migrations `00001`–`00019` are fully applied to staging.
   - `public.platform_admins` exists (migration 00013) with RLS and helper function `is_platform_admin()`, but currently contains 0 records.
   - In migration 00019, `provision_tenant_workspace()` requires `u.email_confirmed_at IS NOT NULL`. Under Phase 4A, admin approval is the authorization boundary, and email verification link is no longer a prerequisite.
   - A new additive migration (`00020_admin_approved_teacher_onboarding.sql`) is required to define `teacher_applications`, an atomic approval RPC (`admin_approve_teacher_application`), and a rejection RPC (`admin_reject_teacher_application`).

---

## 2. Git & Repository Inspection

### 2.1 Branch & Remotes
- **Current Branch:** `main`
- **Configured Remote:**
  ```text
  origin  https://github.com/sithija-ws/EDVORA-Learning-Portal.git (fetch)
  origin  https://github.com/sithija-ws/EDVORA-Learning-Portal.git (push)
  ```
- **Recent Commits:**
  - `434512d` - perf: optimize dashboard navigation and database queries
  - `27e173a` - perf(core): eliminate redundant auth network calls with local getSession and middleware action bypass
  - `91b32bc` - perf(client): enable Link prefetching and staleTimes client cache for instantaneous transitions
  - `68ea6f8` - perf(assets): compress logo.png and remove vercel.json to unlock Vercel dashboard region settings
  - `b978154` - perf(core): parallelize database queries with Promise.all, add edge middleware cookie fast-path, and configure Singapore serverless region in vercel.json

### 2.2 Working Tree Status
- **Modified Tracked Files (38 files):** Core actions, middleware, components, migration 00004 correction, types, constants.
- **Untracked Additions (27 files):** Migrations `00007`–`00019`, `actions/subscriptions.ts`, `app/(auth)/register`, multi-tenant tests (`tests/saas/*`), `lib/auth/*` modules, documentation.
- **Environment Isolation:** `.gitignore` lines 34-36 strictly ignore `.env*` except `.env.example` and `.env.staging.example`. Staging and development secrets remain protected from Git.

### 2.3 Proposed Git Branch Strategy for Phase 4A
1. Create and switch to feature branch: `feature/admin-approved-teacher-onboarding`.
2. Commit Phase 3 multi-tenant infrastructure and verified tests as clean foundation commits.
3. Implement Phase 4A features (routes, components, admin dashboard, migration 00020).
4. Verify tests and build locally.
5. Push `feature/admin-approved-teacher-onboarding` to `origin`.
6. Trigger and monitor Vercel Preview deployment targeting Staging. **Do NOT merge to `main` and do NOT run `vercel --prod`.**

---

## 3. Portal & Routing Architecture Audit

### 3.1 Portal Mapping Matrix

| Portal | Intended Route | Current Route / Status | Description |
| :--- | :--- | :--- | :--- |
| **Teacher Portal** | `/teacher/login` | `/login` (Unified) | Dedicated teacher email/password login. |
| | `/teacher/register` | `/register` (Self-service trial) | Teacher onboarding application form (name, email, password, academy name, slug, phone). Creates `pending` application. |
| | `/teacher/dashboard` | `/dashboard` | Teacher console (batches, lessons, notes, announcements, billing). |
| **Student Portal** | `/student/login` | `/login` (Unified) | Dedicated student workspace slug + username login. |
| | `/home` | `/home` | Student dashboard (lessons, notes, announcements). |
| | `/login` (Legacy) | `/login` | Preserved for backward compatibility, redirecting or providing portal navigation. |
| **Admin Portal** | `/admin/login` | *None* (Does not exist) | Dedicated platform administrator authentication form. |
| | `/admin/dashboard` | *None* (Does not exist) | Comprehensive platform admin dashboard backed by `platform_admins` verification. |

### 3.2 Middleware (`middleware.ts`) Requirements
- Extend `PUBLIC_ROUTES` to include:
  - `/login` (legacy entry)
  - `/student/login`
  - `/teacher/login`
  - `/teacher/register`
  - `/admin/login`
  - `/disabled`
- Maintain 3 performance fast-paths (no-cookie fast-path, Server Action fast-path, cached cookie fast-path).
- Introduce role caching and route isolation for:
  - `admin` -> `/admin/dashboard`
  - `teacher` -> `/dashboard` (or `/teacher/dashboard`)
  - `student` -> `/home`
- Prevent cross-portal bleed:
  - Teachers attempting `/home` or `/admin/*` are redirected to `/dashboard`.
  - Students attempting `/dashboard` or `/admin/*` are redirected to `/home`.
  - Unauthenticated users attempting `/admin/*` are redirected to `/admin/login`.

---

## 4. Database Schema & Migration Audit

### 4.1 Staging State (`voyypkysddyrjuqimzya`)
- Migrations `00001` through `00019` applied remotely.
- All 19 public tables verified with composite foreign keys, RLS policies, and triggers.
- Storage buckets: `notes` (private), `payment_slips` (private, 5 MB limit, image/jpeg, image/png, application/pdf).
- Zero tenants, zero subscriptions, zero trial claims currently provisioned.

### 4.2 Proposed Migration: `00020_admin_approved_teacher_onboarding.sql`
The migration will be strictly additive and contain:

1. **`public.teacher_applications` Table:**
   ```sql
   CREATE TABLE IF NOT EXISTS public.teacher_applications (
     id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
     email          TEXT        NOT NULL,
     full_name      TEXT        NOT NULL,
     phone_number   TEXT,
     institute_name TEXT        NOT NULL,
     workspace_slug TEXT        NOT NULL,
     status         TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
     review_notes   TEXT,
     reviewed_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
     reviewed_at    TIMESTAMPTZ,
     tenant_id      UUID        REFERENCES public.tenants(id) ON DELETE SET NULL,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

2. **Row-Level Security (RLS):**
   - Enable RLS on `teacher_applications`.
   - `teacher_applications_select_self`: Allows authenticated users to view applications matching their `user_id` or canonical email.
   - `teacher_applications_manage_platform_admin`: Grants full SELECT, UPDATE, DELETE to verified platform admins (`is_platform_admin() = true`).

3. **Atomic Approval Stored Procedure (`admin_approve_teacher_application`):**
   - `SECURITY DEFINER` with `SET search_path = ''`.
   - Verifies caller via `public.is_platform_admin()` or `service_role`.
   - Acquires `FOR UPDATE` lock on application row.
   - Validates that application is currently `'pending'`.
   - Atomically:
     - Creates `tenants` record (with `institute_name` and `workspace_slug`).
     - Creates `tenant_members` record (`role = 'owner'`).
     - Checks and records `teacher_trial_claims` using canonical SHA-256 email hash.
     - Creates `tenant_subscriptions` record (`status = 'trialing'`, `trial_started_at = clock_timestamp()`, `trial_ends_at = clock_timestamp() + interval '72 hours'`).
     - Updates application record: `status = 'approved'`, `tenant_id = new_tenant.id`, `reviewed_by = auth.uid()`, `reviewed_at = clock_timestamp()`, `review_notes = p_review_notes`.
     - Ensures applicant profile is active (`is_active = true`).

4. **Rejection Stored Procedure (`admin_reject_teacher_application`):**
   - `SECURITY DEFINER` with `SET search_path = ''`.
   - Updates application: `status = 'rejected'`, `review_notes = p_review_notes`, `reviewed_by = auth.uid()`, `reviewed_at = clock_timestamp()`.

5. **Existing Account Backfill:**
   - Insert pending applications for Teacher A (`sithijax2@gmail.com`) and Teacher B (`sithija.ws@gmail.com`) so they immediately appear in the admin review queue.

---

## 5. Platform Admin Bootstrap Procedure

Since `public.platform_admins` currently contains 0 records, the initial platform administrator must be bootstrapped securely via PostgreSQL SQL Editor or Supabase CLI:

```sql
-- 1. Identify or register the administrator in auth.users
-- Example admin email: admin@edvora.lk (or designated project owner email)

-- 2. Insert into profiles (if not auto-created by auth trigger)
INSERT INTO public.profiles (id, full_name, role, is_active)
SELECT id, 'Edvora Super Admin', 'teacher', true
FROM auth.users
WHERE email = 'admin@edvora.lk'
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- 3. Bootstrap platform administrator record
INSERT INTO public.platform_admins (user_id, notes)
SELECT id, 'Primary Platform Administrator (Bootstrapped)'
FROM auth.users
WHERE email = 'admin@edvora.lk'
ON CONFLICT (user_id) DO NOTHING;
```

---

## 6. Admin Dashboard Specification (`/admin/dashboard`)

The Admin Dashboard will be designed using Tailwind CSS matching Edvora's brand aesthetics (Brand color: `#EA6300` / Primary Orange), featuring:

1. **Header & Navigation Bar:**
   - Brand logo, platform badge (`Platform Administration`), admin profile display, sign-out button.
2. **Metrics Overview Cards:**
   - Total Teachers, Pending Applications, Active Students, Active Subscriptions, Pending Bank Slips, Platform Monthly MRR.
3. **Tab 1: Teacher Applications (Core Workflow):**
   - Filter by status (`pending`, `approved`, `rejected`).
   - Detailed applicant card / modal: Teacher Name, Email, Phone, Academy Name, Requested Slug, Submission Timestamp.
   - Action controls: "Approve & Provision 72h Trial" and "Reject Application" with required/optional review notes.
4. **Tab 2: Teachers & Workspaces:**
   - Table of provisioned workspaces: Academy Name, Slug, Owner Email, Student Count, Subscription Plan & Status, Workspace Status (Active/Suspended).
   - Workspace suspension toggle.
5. **Tab 3: Subscriptions & Billing:**
   - Table of tenant subscriptions: Workspace, Plan (Starter / Growth / Pro), Status (trialing, active, pending_payment, expired), Expiry date, Student Quota usage.
6. **Tab 4: Payment Verifications:**
   - Pending bank deposit slips awaiting review.
   - Secure signed URL preview for uploaded slip image/PDF from `payment_slips` bucket.
   - Verification controls: "Approve (Activate 30-Day Sub)" or "Reject Payment" with reason.
7. **Tab 5: Commercial Settings:**
   - Display catalog pricing: Starter (LKR 2,600/mo), Growth (LKR 5,000/mo), Pro (LKR 8,000/mo).
8. **Tab 6: Audit Logs:**
   - Table of recent administrative actions from `subscription_history` and application reviews.

---

## 7. Verification & Readiness Assessment

| Area | Current Status | Phase 4A Readiness |
| :--- | :--- | :--- |
| **Git Working Tree** | Uncommitted Phase 3 files on `main` | Ready to branch `feature/admin-approved-teacher-onboarding` |
| **Automated Tests** | 74/74 tests passing | Ready |
| **Next.js Build** | Production build passes | Ready |
| **Staging DB (`voyypkysddyrjuqimzya`)** | Migrations 00001–00019 applied | Ready for additive migration 00020 |
| **Dev DB (`sauphnaxchcouqslflsl`)** | Detached & untouched | Protected |
| **Zero-Budget Compliance** | Free Supabase & Vercel tiers; no paid APIs | Compliant |
| **Brand Identity** | `#EA6300`, Lucide icons, Dark/Light theme | Compliant |

---

## 8. Recommendation & Next Steps

Phase A (Read-Only Audit) is complete. No files have been committed to GitHub, no database migrations have been executed, and no deployments have been triggered.

Upon user approval of this report:
1. **Proceed to Phase B: Implementation Plan:**
   - Define exact file-by-file changes and migration 00020 SQL schema.
2. **Phase C: Implementation & Local Verification:**
   - Create feature branch `feature/admin-approved-teacher-onboarding`.
   - Apply additive migration `00020_admin_approved_teacher_onboarding.sql` to staging database.
   - Implement portal routes (`/teacher/*`, `/student/*`, `/admin/*`) and Server Actions.
   - Build `/admin/dashboard` components.
   - Update tests and verify Next.js build.
3. **Phase D: GitHub Push & Vercel Preview Deployment:**
   - Push feature branch to `sithija-ws/EDVORA-Learning-Portal`.
   - Verify Vercel preview deployment on staging Supabase.
