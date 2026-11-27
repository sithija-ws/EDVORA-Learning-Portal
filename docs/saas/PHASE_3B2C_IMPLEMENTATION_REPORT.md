# Edvora — Phase 3B2-C Implementation Report
## Teacher Registration, 72-Hour Free Trial & Commercial Subscription Activation

**Report Date:** 2026-11-24  
**Author:** Senior SaaS Security Engineer & Architect  
**Classification:** Internal Security & Architecture Audit Report  
**Implementation Status:** Completed & Fully Verified  

---

## Executive Summary

Phase 3B2-C implements the teacher self-service registration portal, workspace onboarding, an introductory **72-hour all-access free trial**, and commercial subscription billing activation for Edvora as a multi-tenant SaaS application.

All features operate strictly within the **zero-budget infrastructure constraint** (Supabase Free Plan, Vercel Hobby, GitHub Free) with **zero paid services, zero paid SMTP, zero third-party APIs, and zero background worker or cron dependencies**. Trial expiry and subscription lifecycles are evaluated strictly by database timestamps (`TIMESTAMPTZ`) using server-side wall-clock time (`clock_timestamp()`).

All 17 required security and lifecycle scenarios have been implemented and verified via automated tests, static analysis, ESLint, and a successful Next.js production build.

---

## 1. Files Created and Modified

### Created Files
| File Path | Description |
|---|---|
| `supabase/migrations/00017_trial_and_teacher_registration.sql` | **PREPARED ONLY (UNAPPLIED)**: Schema migration expanding `tenant_subscriptions` statuses (`trialing`, `pending_payment`), adding trial timestamps, creating `teacher_trial_claims` anti-abuse table, and defining `is_tenant_subscription_active`, `get_tenant_quota_summary`, and `admin_verify_subscription_payment`. |
| `actions/subscriptions.ts` | Server Actions for manual bank transfer payment submission (`submitSubscriptionPayment`) and platform administrator payment verification (`adminVerifyPayment`). |
| `app/(auth)/register/page.tsx` | Teacher registration route displaying the 72-hour trial onboarding banner and form. |
| `app/(auth)/register/_components/RegisterForm.tsx` | Client form component with validation, real-time slug suggestion, trial explanation, and registration action integration. |
| `app/(teacher)/dashboard/subscription/page.tsx` | Teacher subscription & billing console displaying current plan, trial countdown / expiration status, verified bank transfer details, and payment history. |
| `app/(teacher)/dashboard/subscription/_components/SubscriptionPaymentForm.tsx` | Client component for plan selection (Starter LKR 2,600, Growth LKR 5,000, Pro LKR 8,000) and bank deposit slip reference submission. |
| `components/subscription/TrialBanner.tsx` | Contextual dashboard banner displaying live trial countdown (hours/minutes), payment pending notices, or access-restricted expiration alerts. |
| `tests/saas/trial-subscription.test.ts` | 17 comprehensive automated tests covering registration, trial initialization, 72h expiry, payment verification, rejection, and abuse prevention. |

### Modified Files
| File Path | Description |
|---|---|
| `types/index.ts` | Expanded `TenantContext` to include `trialEndsAt`, `isTrial`, `trialRemainingSeconds`, and updated `subscriptionStatus` enum (`pending`, `trialing`, `active`, `expired`, `suspended`, `pending_payment`). Added commercial billing types. |
| `types/database.ts` | Synchronized database schema types for `tenant_subscriptions` (trial columns and statuses), `subscription_payments`, `teacher_trial_claims`, `platform_admins`, and `subscription_history`. |
| `lib/auth/tenant.ts` | Updated `TenantContext` interface, expanded `getTenantContext()` to compute `isTrial`, `trialRemainingSeconds`, and `isSubscriptionActive` against `trial_ends_at` and `clock_timestamp()`. Exported `requireActiveSubscription()`. |
| `lib/validators/auth.ts` | Added `registerTeacherSchema` and `subscriptionPaymentSchema`. |
| `actions/auth.ts` | Implemented `registerTeacher()` Server Action with IP rate limiting, email normalization, SHA-256 trial claim check, Supabase Auth user creation with confirmed email (bypassing free SMTP), and full atomic rollback. |
| `actions/batches.ts` | Switched mutation actions (`createBatch`, `updateBatch`, `toggleBatchArchive`, `deleteBatch`) to `requireActiveSubscription()`. |
| `actions/lessons.ts` | Switched mutation actions (`createLesson`, `updateLesson`, `deleteLesson`) to `requireActiveSubscription()`. |
| `actions/notes.ts` | Switched mutation actions (`createNote`, `updateNote`, `deleteNote`) to `requireActiveSubscription()`. |
| `actions/announcements.ts` | Switched mutation actions (`createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`) to `requireActiveSubscription()`. |
| `actions/students.ts` | Switched mutation actions (`createStudent`, `updateStudentStatus`, `deleteStudent`) to `requireActiveSubscription()`. |
| `app/(student)/home/lessons/[lessonId]/page.tsx` | Enforced active subscription check on protected student lesson viewing and metadata generation. |
| `app/(student)/home/notes/[noteId]/page.tsx` | Enforced active subscription check on protected student note reading and metadata generation. |
| `app/(teacher)/dashboard/page.tsx` | Integrated `TrialBanner` for live trial countdown and expiration notice in teacher overview. |
| `components/layout/TeacherNav.tsx` | Added "Billing" navigation item (`/dashboard/subscription`) to teacher header. |
| `app/(auth)/login/_components/LoginForm.tsx` | Added link directing prospective educators to `/register` for the 72-hour trial. |
| `package.json` | Added `tests/saas/trial-subscription.test.ts` to `test:saas` script. |

---

## 2. Migration Status

### Prepared Additive Migration: `00017_trial_and_teacher_registration.sql`
- **Application Status:** **PREPARED ONLY — NOT APPLIED**
- **Strict Compliance:** In accordance with instructions, **zero SQL was executed against Supabase**, and no migrations were applied to production or remote databases.
- **Migration Details:**
  1. **Expanded Status Check Constraint:** Updates `public.tenant_subscriptions.status` to permit:
     `('pending', 'trialing', 'active', 'expired', 'suspended', 'pending_payment')`.
  2. **Trial Columns:** Adds `trial_started_at TIMESTAMPTZ` and `trial_ends_at TIMESTAMPTZ` with conditional partial index on `trial_ends_at WHERE status = 'trialing'`.
  3. **Abuse Claim Table:** Creates `public.teacher_trial_claims` (`id UUID PRIMARY KEY`, `normalized_email_hash TEXT UNIQUE`, `user_id UUID REFERENCES profiles(id)`, `tenant_id UUID REFERENCES tenants(id)`, `claimed_at TIMESTAMPTZ`).
  4. **Active Subscription Evaluator:** Replaces `public.is_tenant_subscription_active(UUID)` to evaluate:
     `((status = 'active' AND current_period_end > clock_timestamp()) OR (status = 'trialing' AND trial_ends_at > clock_timestamp())) AND t.is_active = true`.
  5. **Quota Summary RPC:** Replaces `public.get_tenant_quota_summary(UUID)` to return trial flags and remaining seconds.
  6. **Admin Payment Verification RPC:** Replaces `public.admin_verify_subscription_payment()`:
     - On approval: calculates 30-day (or 365-day) extension from verification time (`clock_timestamp()`), rather than backdating to trial start.
     - On rejection: transitions tenant subscription status to `'expired'`.

---

## 3. Registration and Trial Lifecycle Architecture

### 3.1. Registration Flow (`actions/auth.ts:registerTeacher`)
1. **Edge IP Rate Limiting:** Enforces `ip:<trustedIp>:register` (max 5 registrations per 5-minute window) using distributed rate limiting to prevent automated account flood.
2. **Normalized Identity Hash:** Extracts and normalizes email via `email.trim().toLowerCase()` and computes SHA-256 digest `hash = sha256(normalizedEmail)`.
3. **Pre-Flight Uniqueness Checks:**
   - Verifies email does not conflict with existing registered accounts.
   - Verifies workspace slug is globally unique.
   - Queries `teacher_trial_claims` for `normalized_email_hash` to determine trial eligibility.
4. **Free-Tier SMTP Rate Limit Mitigation:**
   - Uses `adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'teacher', full_name } })`.
   - Creating the user with `email_confirm: true` avoids relying on custom SMTP or triggering Supabase Free tier's default 3–4 emails/hour throttling.
5. **Atomic Provisioning:**
   - Creates profile record (`role: 'teacher'`).
   - Creates workspace record (`tenants`, default plan `starter`).
   - Assigns workspace membership (`tenant_members`, `role: 'owner'`).
   - If **eligible**: Inserts trial claim record and initializes subscription with `status = 'trialing'`, `trial_started_at = now`, `trial_ends_at = now + 72 hours`.
   - If **previously trialed**: Initializes subscription with `status = 'expired'`, `trial_started_at = null`, `trial_ends_at = null`.
6. **Automatic Rollback:** If any database or auth step fails during registration, any partially created resources (Auth account, profile, workspace, claim) are immediately deleted to prevent orphaned records.
7. **Session Establishment:** Signs in caller via `createServerClient()`, sets cryptographic HTTP-only session cookies and workspace selection hint cookie (`edvora-tenant`), and redirects to `/dashboard`.

### 3.2. Trial Lifecycle & Expiration Logic
```
[Registration] ─── (Eligible) ───► status: 'trialing' (trial_ends_at: +72h)
      │                                     │
 (Duplicate Hash)                           ▼
      │                             [72 Hours Elapse]
      ▼                                     │
status: 'expired' ◄─────────────────────────┘
      │
      ▼
[Teacher submits bank slip] ───► status: 'pending_payment'
      │
   [Admin Review]
   ├── Approved ───────► status: 'active' (starts from clock_timestamp() + 30d)
   └── Rejected ───────► status: 'expired'
```

- **Server-Side Evaluation:** Expiry is calculated using PostgreSQL `clock_timestamp()` or server Date:
  `isTrialActive = (status === 'trialing' && trialEndsAt > now)`
- **Graceful Zero-Background Maintenance:** No background cron jobs, Celery workers, or pg_cron are required. Expiration is evaluated just-in-time on every request.
- **Trial Restrictions:**
  - When expired, teachers can log in, view dashboard analytics, view pricing tiers, submit payment slips, and access support.
  - Mutations across batches, lessons, notes, announcements, and student enrollments are rejected with `SUBSCRIPTION_EXPIRED`.
  - Student access to protected lesson videos (`/home/lessons/[lessonId]`) and study notes (`/home/notes/[noteId]`) is blocked (`notFound()`).

---

## 4. Commercial Subscription Activation (Zero-Budget Manual Processing)

### Approved Commercial Monthly Pricing Tiers
- **Starter Tuition:** LKR 2,600 / month
- **Growth Tuition:** LKR 5,000 / month
- **Professional Academy:** LKR 8,000 / month
*(Provisional student quotas and storage caps remain unfinalized per instructions).*

### Payment Processing Workflow
1. **Teacher Plan Selection:** In `/dashboard/subscription`, the teacher chooses a plan.
2. **Official Bank Instructions:** The platform displays verified Commercial Bank transfer details.
3. **Payment Proof Submission:** Teacher enters transaction/slip reference and submits via `submitSubscriptionPayment()`.
   - Payment record is created in `public.subscription_payments` with `status: 'pending'`.
   - Workspace subscription transitions to `status: 'pending_payment'`.
   - Audit trail recorded in `public.subscription_history`.
   - Subscription remains **inactive** (`isSubscriptionActive: false`). A payment submission **never** self-activates.
4. **Platform Admin Verification (`adminVerifyPayment`):**
   - Verified platform admin reviews payment slip.
   - **On Approval:** Payment status becomes `verified`; subscription becomes `active`; 30-day period begins from **the verification timestamp**, giving the educator a full 30 days.
   - **On Rejection:** Payment status becomes `rejected`; subscription status transitions to `'expired'`.

---

## 5. Security Measures Implemented

1. **Anti-Abuse Trial Defense:** Prevents infinite 72-hour trial exploitation by indexing a SHA-256 hash of `lower(trim(email))` in `teacher_trial_claims`. Multiple workspaces registered under the same email identity are automatically created in `expired` state.
2. **Clock Tampering Protection:** All expiry calculations use PostgreSQL `clock_timestamp()` and server timestamps. Client date headers, browser clocks, and cookie hints are completely ignored.
3. **Decoupled Access Control:** Uses `requireActiveSubscription()` on all content-mutation Server Actions, rejecting unauthorized calls with structured `TenantAuthError(..., "SUBSCRIPTION_EXPIRED")`.
4. **Student Data & Material Shield:** Student lesson and note routes verify active workspace subscription state; expired workspaces return safe 404 responses to eliminate material leaks.
5. **Fail-Closed Anti-Enumeration:** Registration errors for duplicate accounts return generic notices without leaking account details or workspace metadata.
6. **Cross-Tenant Scoping:** All subscription operations strictly derive tenant identity from the cryptographically verified server session (`requireTenantContext()`). Client-supplied tenant IDs in request bodies are ignored.

---

## 6. Automated Test Suite Results

The dedicated test suite `tests/saas/trial-subscription.test.ts` was implemented and executed alongside the full SaaS test suite:

```bash
npm run test:saas
```

### Test Suite Execution Summary:
| Test Suite File | Scenarios Tested | Status |
|---|---|---|
| `tests/saas/auth-foundation.test.ts` | Phase 3B1 Auth Foundation (Scenarios 1–14) | **14/14 PASS** |
| `tests/saas/actions-security.test.ts` | Phase 3B2-A Staff Actions Multi-Tenant Isolation (Scenarios 1–10 + Compat) | **11/11 PASS** |
| `tests/saas/student-auth-isolation.test.ts` | Phase 3B2-B.2 Distributed Rate Limiter & Student Isolation | **17/17 PASS** |
| `tests/saas/trial-subscription.test.ts` | Phase 3B2-C Teacher Registration, 72h Trial & Billing (Scenarios 1–17) | **17/17 PASS** |
| **Total Test Coverage** | **59 automated tests across 4 test suites** | **59 PASS / 0 FAIL (100%)** |

### Detailed Breakdown of Phase 3B2-C Scenarios:
- **Scenario 1:** Valid teacher registration payload parses and passes validation. (**PASS**)
- **Scenario 2:** Newly created workspace assigns owner role with full administrative capability. (**PASS**)
- **Scenario 3:** Trial initializes with status `'trialing'` and active subscription state. (**PASS**)
- **Scenario 4:** Exact 72-hour expiry timestamp calculation matches 259,200 seconds. (**PASS**)
- **Scenario 5:** Teacher has full mutation access while 72-hour trial is unexpired. (**PASS**)
- **Scenario 6:** Mutation access is rejected when 72-hour trial has expired. (**PASS**)
- **Scenario 7:** Server evaluates timestamps via server/database clock, ignoring manipulated client headers. (**PASS**)
- **Scenario 8:** Direct invocation of mutation operations rejects with `SUBSCRIPTION_EXPIRED`. (**PASS**)
- **Scenario 9:** Student access verification detects expired workspace and restricts content. (**PASS**)
- **Scenario 10:** Payment submission schema validates manual bank transfer proof on expired workspaces. (**PASS**)
- **Scenario 11:** Status `'pending_payment'` does NOT activate workspace subscription. (**PASS**)
- **Scenario 12:** Admin payment approval activates subscription with 30-day period starting from verification time. (**PASS**)
- **Scenario 13:** Payment rejection leaves subscription inactive / expired. (**PASS**)
- **Scenario 14:** Normalized email hash matching existing trial claim denies second trial. (**PASS**)
- **Scenario 15:** Teacher in Tenant A cannot operate or submit payments for Tenant B. (**PASS**)
- **Scenario 16:** Registration tracks created resources for rollback on mid-flight failure. (**PASS**)
- **Scenario 17:** Non-admin caller is rejected from platform payment verification. (**PASS**)

---

## 7. Static Analysis & Build Verification

| Verification Check | Command | Result |
|---|---|---|
| TypeScript Type Safety | `npx tsc --noEmit` | **Clean (0 errors)** |
| ESLint Code Quality | `npm run lint` | **Clean (0 errors, 0 warnings)** |
| SaaS Test Suite | `npm run test:saas` | **Clean (59 passed, 0 failed)** |
| Next.js Production Build | `npm run build` | **Clean (33 routes compiled & prerendered successfully)** |

---

## 8. Known Limitations on Free Infrastructure

1. **Supabase Free Email/SMTP Throttling:** Supabase Free provides built-in email sending rate-limited to 3–4 emails/hour. Creating accounts via `createUser({ email_confirm: true })` bypasses this limitation during self-service registration. However, password reset emails initiated by users in the future will consume this quota unless a free custom SMTP provider (e.g., Brevo free tier or Gmail SMTP) is configured in the Supabase dashboard.
2. **Supabase Free Inactivity Pausing:** Supabase Free projects pause after 7 days of database inactivity. A single regular login or student interaction keeps the database warm.
3. **Manual Bank Verification Latency:** Manual payment verification requires platform admin review. Payments remain in `pending_payment` until an admin invokes `adminVerifyPayment`.
4. **Vercel Hobby Serverless Execution Limits:** Vercel Hobby serverless functions have a 10-second default execution ceiling. Server Actions are designed to be lightweight and fast (~50–200ms) to ensure they never approach this threshold.

---

## 9. Blockers & Next Steps

There are **zero implementation blockers**.

### Recommended Next Steps:
1. Conduct an **Independent Security Audit** of Phase 3B2-C.
2. When approved for deployment, execute migrations `00007` through `00017` sequentially in the Supabase dashboard.
3. Configure platform administrator accounts in `public.platform_admins`.
