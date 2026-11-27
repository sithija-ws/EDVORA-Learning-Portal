# Edvora — Phase 3B2-C.1 Implementation Report
## Independent Security Audit Remediation

**Report Date:** 2026-11-24  
**Author:** Senior SaaS Security & Database Systems Architect  
**Classification:** Security Architecture & Remediation Verification  
**Scope:** Remediation of all findings in `docs/saas/PHASE_3B2C_INDEPENDENT_SECURITY_REVIEW.md`, migrations `00007`–`00018`, two-stage email verification onboarding, provider-aware email canonicalization, atomic workspace provisioning RPC, private storage RLS, server-bound payment pricing, externalized banking config, and student catalog protection.  
**Constraint Compliance:** Strict zero-budget infrastructure (Supabase Free, Vercel Hobby development, GitHub Free). Zero migrations applied to Supabase, zero deployments executed.

---

## 1. Executive Summary

Phase 3B2-C.1 successfully remediates all vulnerabilities, operational weaknesses, and architectural deficiencies identified during the Phase 3B2-C Independent Security Review.

The system now enforces strict **Two-Stage Educator Onboarding**, eliminating unverified email pre-confirmation (`email_confirm: true`), preventing identity squatting and unauthorized 72-hour trial exhaustion. Email identities are normalized via **provider-aware canonicalization** (`lib/auth/canonical.ts`), defeating sub-addressing ("plus-addressing") and dot-aliasing bypasses against trial abuse registry. Multi-step provisioning across distributed HTTP REST calls has been replaced with an ACID-compliant PostgreSQL procedure (`public.provision_tenant_workspace`), and manual bank payments are verified atomically via `public.admin_verify_subscription_payment`.

### Quality & Verification Highlights
- **Automated Tests:** **66/66 unit/integration tests passing** across 4 test suites (`npm run test:saas`).
- **Static Analysis:** **0 TypeScript errors** (`npx tsc --noEmit`).
- **Linter:** **0 ESLint errors, 0 ESLint warnings** (`npm run lint`).
- **Production Build:** Next.js Turbopack compiled and generated static pages for all **33 routes** without errors (`npm run build`).
- **Database Migrations:** Migration `00018_atomic_workspace_provisioning_and_storage.sql` prepared cleanly alongside unapplied migrations `00007`–`00017`.

---

## 2. Audit Remediation Matrix

| Finding ID | Severity | Category | Remediation Action | Status |
|---|---|---|---|---|
| **SEC-3B2C-CRIT-01** | **CRITICAL** | Authentication / Abuse | Removed `email_confirm: true`. Enforced Two-Stage Onboarding: workspace and 72-hour trial provisioned only after email ownership is confirmed. | **RESOLVED** |
| **SEC-3B2C-HIGH-01** | **HIGH** | Trial Abuse Defense | Created `lib/auth/canonical.ts` with provider-aware dot/plus canonicalization before SHA-256 hashing. | **RESOLVED** |
| **SEC-3B2C-HIGH-02** | **HIGH** | Commercial Compliance | Formulated zero-cost commercially compliant hosting roadmap (Cloudflare Pages/Workers & VPS Docker/Coolify). | **DOCUMENTED** |
| **SEC-3B2C-MED-01** | **MEDIUM** | Concurrency / Atomicity | Implemented atomic PostgreSQL stored procedure `public.provision_tenant_workspace()` in migration 00018; updated `adminVerifyPayment` to invoke atomic RPC. | **RESOLVED** |
| **SEC-3B2C-MED-02** | **MEDIUM** | Data Privacy | Created private storage bucket `payment_slips` (`public = false`) with multi-tenant path-prefixed RLS policies in migration 00018. | **RESOLVED** |
| **SEC-3B2C-LOW-01** | **LOW** | Financial Integrity | Bound `amount_lkr` strictly to server-side `subscription_plans` catalog pricing in `actions/subscriptions.ts:submitSubscriptionPayment`. | **RESOLVED** |
| **SEC-3B2C-LOW-02** | **LOW** | Maintainability | Externalized bank transfer instructions into `lib/config/payment.ts` reading server environment variables. | **RESOLVED** |
| **SEC-3B2C-INFO-01** | **INFORMATIONAL** | Student UX | Added active subscription checks to `/home/lessons` and `/home/notes` index pages to display inactive workspace banner rather than 404 links. | **RESOLVED** |
| **SEC-3B2C-INFO-02** | **INFORMATIONAL** | Infrastructure Risk | Documented zero-cost 24–48h keep-alive ping strategy to prevent Supabase Free 7-day inactivity pause. | **DOCUMENTED** |
| **SEC-3B2C-INFO-03** | **INFORMATIONAL** | Quality Assurance | Expanded test suite to 66 test scenarios covering canonicalization, verification enforcement, and atomic RPCs. | **RESOLVED** |

---

## 3. Detailed Technical Remediation

### 3.1 SEC-3B2C-CRIT-01: Two-Stage Educator Email Verification Architecture

#### The Vulnerability
In Phase 3B2-C, `registerTeacher` called `adminClient.auth.admin.createUser({ email_confirm: true })`. This bypassed email verification, immediately provisioning a tenant workspace, owner membership, and intro trial claim. Malicious actors could register legitimate teachers' email addresses, squat on their identity, and burn their 72-hour trial before the legitimate educator ever registered.

#### The Solution: Two-Stage Onboarding
1. **Stage 1 — Registration (Unconfirmed User):**
   - In `actions/auth.ts:registerTeacher()`, user registration is initiated via `supabase.auth.signUp()` without pre-confirming (`email_confirm: false`).
   - The user's metadata records `full_name`, `role: 'teacher'`, `pending_workspace_name`, `pending_workspace_slug`, and `canonical_email_hash`.
   - The teacher profile is initialized in `profiles`.
   - **Crucially:** No tenant workspace is created, no owner membership is granted, no trial claim is recorded, and no 72-hour trial clock begins.
   - The action returns `{ success: true, data: { pendingVerification: true, email } }`.
   - The client UI in `RegisterForm.tsx` transitions to an interactive "Verify Your Email Address" screen with a resend verification button (`resendVerificationEmail`).

2. **Stage 2 — Onboarding Completion (Email Confirmed):**
   - When the teacher clicks the verification link in their inbox, Supabase Auth sets `email_confirmed_at = clock_timestamp()`.
   - Upon logging in at `/login`, `actions/auth.ts:signIn()` authenticates the verified user.
   - The action checks whether the teacher already possesses a workspace membership in `tenant_members`.
   - If not, it executes the atomic procedure `public.provision_tenant_workspace()` using the verified metadata.
   - The 72-hour trial commences from the exact moment of verification/login, ensuring the teacher receives the full 72 hours.
   - If an unconfirmed teacher attempts to sign in prior to clicking the verification link, Supabase returns an error, and `signIn()` informs the user:
     *"Please verify your email address before logging in. We have sent a confirmation link to your inbox."*

---

### 3.2 SEC-3B2C-HIGH-01: Provider-Aware Email Canonicalization

#### The Vulnerability
Major email providers support plus-addressing (`user+tag@domain`) and period aliasing (`u.s.e.r@gmail.com`). Hashing raw emails via `sha256(trim(lower(email)))` allowed a single mailbox owner to generate infinite trials (`teacher+1@gmail.com`, `teacher+2@gmail.com`).

#### The Solution (`lib/auth/canonical.ts`)
A dedicated module `lib/auth/canonical.ts` implements provider-aware canonicalization:
1. Normalizes unicode via `NFKC`, removes outer whitespace, and converts to lowercase.
2. Standardizes domain aliases (`googlemail.com` $\rightarrow$ `gmail.com`).
3. For Google domains (`gmail.com`):
   - Strips sub-address tags (`+tag`).
   - Strips all dots (`.`) from the local username.
4. For Microsoft (`outlook.com`, `hotmail.com`), Proton (`proton.me`), iCloud (`icloud.com`), and Fastmail:
   - Strips sub-address tags (`+tag`).
   - Preserves dots (dots are semantically significant in these providers).
5. For corporate, university, and custom domains:
   - Preserves dots and plus characters to avoid mangling valid literal mailbox names.
6. Computes SHA-256 on the resulting canonical string.

```typescript
// Verified test results:
canonicalizeEmail("teacher+trial1@gmail.com") === "teacher@gmail.com";
canonicalizeEmail("t.e.a.c.h.e.r@gmail.com") === "teacher@gmail.com";
canonicalizeEmail("T.E.A.C.H.E.R+promo@Googlemail.Com") === "teacher@gmail.com";

getCanonicalEmailHash("teacher+trial1@gmail.com") === getCanonicalEmailHash("teacher@gmail.com");
```

---

### 3.3 SEC-3B2C-HIGH-02: Commercial SaaS Compliance & Zero-Cost Hosting Roadmap

Section 1.3 of the Vercel Hobby Terms of Service explicitly forbids hosting commercial paid SaaS applications. Because Edvora charges recurring monthly fees (LKR 2,600 / 5,000 / 8,000), long-term operation on Vercel Hobby presents a compliance risk.

Per strict zero-budget instructions, hosting is not migrated during this phase. However, a commercially compliant deployment roadmap is established:

```mermaid
flowchart TD
    A["Edvora Commercial Next.js App"] --> B{"Hosting Strategy"}
    B -->|"Zero Cost (Compliant)"| C["Cloudflare Pages + Workers"]
    B -->|"Zero Cost (Compliant)"| D["Fly.io / Render Free Tier"]
    B -->|"Minimal Budget ($3.50/mo from 1st paying teacher)"| E["Self-Hosted Linux VPS (Hetzner / OVH) via Coolify/Docker"]
    B -->|"Future Scale ($20/seat)"| F["Vercel Pro Subscription"]

    C --> C1["Unlimited bandwidth<br>Explicit commercial authorization<br>Global edge CDN"]
    E --> E1["Zero platform terms risk<br>Dedicated database keep-alive<br>Full Docker container isolation"]
```

**Recommended Staging Action:** Before advertising Edvora to commercial tuition centers, deploy to **Cloudflare Pages** (100% free and explicitly permits commercial SaaS) or host via **Coolify on a $3.50/mo VPS** funded by the first teacher subscription.

---

### 3.4 SEC-3B2C-MED-01: Atomic PostgreSQL Workspace Provisioning & Payment Verification

#### Multi-Step Rest Elimination
Previously, `registerTeacher` performed 6 sequential REST queries across `auth.admin`, `profiles`, `tenants`, `tenant_members`, `teacher_trial_claims`, and `tenant_subscriptions`. A serverless timeout midway could create orphaned records.

#### Atomic RPC: `public.provision_tenant_workspace()`
Defined in `supabase/migrations/00018_atomic_workspace_provisioning_and_storage.sql`:
- Executes inside a single atomic PostgreSQL transaction.
- `SECURITY DEFINER SET search_path = ''`.
- Validates caller authorization (`auth.uid() = p_user_id` or platform admin).
- Confirms teacher role and active profile status.
- Validates workspace slug uniqueness.
- Checks `p_canonical_email_hash` against `public.teacher_trial_claims`.
- Inserts `tenants`, `tenant_members` (as `owner`), `teacher_trial_claims` (if eligible), and `tenant_subscriptions` (`trialing` with 72h expiry, or `expired` if duplicate).
- Returns workspace summary record or rolls back completely on any error.

#### Atomic RPC: `public.admin_verify_subscription_payment()`
In `actions/subscriptions.ts:adminVerifyPayment()`, multi-step REST queries were replaced with:
```typescript
const { error: rpcErr } = await supabase.rpc("admin_verify_subscription_payment", {
  p_payment_id: paymentId,
  p_approve: approve,
  p_rejection_reason: rejectionReason ?? null,
  p_extension_days: extensionDays ?? null,
});
```
This guarantees atomic state transition of both `subscription_payments` and `tenant_subscriptions` along with audit logging in `subscription_history`.

---

### 3.5 SEC-3B2C-MED-02: Private Storage Bucket RLS for Payment Slips

Migration `00018_atomic_workspace_provisioning_and_storage.sql` configures a dedicated private bucket `payment_slips`:
- **Bucket Visibility:** `public = false`. Direct CDN enumeration is impossible.
- **Upload Policy (`INSERT`):**
  ```sql
  CREATE POLICY "payment_slips_upload_tenant_admin"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'payment_slips'
      AND public.try_cast_uuid(split_part(name, '/', 1)) IS NOT NULL
      AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
    );
  ```
- **Read Policy (`SELECT`):** Restricts reads strictly to tenant administrators/owners of that tenant folder (`{tenant_id}/*`) or platform administrators.
- **Management Policy (`UPDATE`/`DELETE`):** Restricted to tenant admins of that workspace or platform admins.

---

### 3.6 SEC-3B2C-LOW-01: Server-Side Payment Amount Integrity

In `actions/subscriptions.ts:submitSubscriptionPayment()`, `amount_lkr` is no longer trusted from client form data. Instead, the server queries `subscription_plans` and derives the expected price directly:
```typescript
const expectedAmountLkr =
  billingCycle === "annual" && plan.price_lkr_annual
    ? plan.price_lkr_annual
    : plan.price_lkr_monthly;

amount_lkr: expectedAmountLkr,
```
Even if a malicious user alters the client payload to `amountLkr: 1.00`, the server records the authoritative catalog price (LKR 2,600 / 5,000 / 8,000), preventing misleading audit trails.

---

### 3.7 SEC-3B2C-LOW-02: Externalized Bank Transfer Configuration

Bank details (Commercial Bank of Ceylon, account number, branch, account name) have been extracted into `lib/config/payment.ts`. The configuration reads from server environment variables with safe defaults:
- `BANK_NAME` (default: `"Commercial Bank of Ceylon"`)
- `BANK_BRANCH` (default: `"Colombo Main Branch"`)
- `BANK_ACCOUNT_NAME` (default: `"Edvora Technologies (Pvt) Ltd"`)
- `BANK_ACCOUNT_NUMBER` (default: `"8010045678"`)
- `BANK_PAYMENT_INSTRUCTIONS`

`app/(teacher)/dashboard/subscription/page.tsx` loads these details on the server and passes them to `SubscriptionPaymentForm`. Changing bank accounts in production now requires only updating environment variables without requiring code edits or rebuilds.

---

### 3.8 SEC-3B2C-INFO-01: Student Catalog Protection on Expired Workspaces

In `app/(student)/home/lessons/page.tsx` and `app/(student)/home/notes/page.tsx`:
1. The student's enrolled workspace subscription statuses are checked against `clock_timestamp()`.
2. If all workspaces are expired or trialing in the past, an informative banner is displayed:
   *"Workspace Access Inactive: Your tuition academy's trial or subscription is currently inactive. Lesson/note access is paused until your instructor renews their workspace subscription."*
3. If a student is enrolled in multiple academies, only active workspaces are queried for batches, lessons, and notes, preventing confusing 404 links.

---

## 4. Test Suite & Verification Results

### Test Suite Execution (`npm run test:saas`)
```
▶ Phase 3B2-A: Server Actions Multi-Tenant Security & Isolation
  ✔ 11 tests passed
✔ Phase 3B2-A: Server Actions Multi-Tenant Security & Isolation (155ms)

▶ Phase 3B1: Multi-Tenant Authentication & Authorization Foundation
  ✔ 14 tests passed
✔ Phase 3B1: Multi-Tenant Authentication & Authorization Foundation (13ms)

▶ Phase 3B2-B.2: Distributed Rate Limiter Security Hardening
  ✔ 17 tests passed
✔ Phase 3B2-B.2: Distributed Rate Limiter Security Hardening (1141ms)

▶ Phase 3B2-C: Teacher Registration, 72-Hour Free Trial & Commercial Subscriptions
  ✔ Scenario 1: Valid teacher registration payload parses and passes validation (3.4ms)
  ✔ Scenario 2: Newly created workspace assigns owner role with full administrative capability (68.4ms)
  ✔ Scenario 3: Trial initializes with status 'trialing' and active subscription state (1.6ms)
  ✔ Scenario 4: Exact 72-hour expiry timestamp calculation matches 259,200 seconds (0.2ms)
  ✔ Scenario 5: Teacher has full mutation access while 72-hour trial is unexpired (1.4ms)
  ✔ Scenario 6: Mutation access is rejected when 72-hour trial has expired (2.4ms)
  ✔ Scenario 7: Server evaluates timestamps via server/database clock, ignoring manipulated client headers (1.2ms)
  ✔ Scenario 8: Direct invocation of mutation operations rejects with SUBSCRIPTION_EXPIRED (7.9ms)
  ✔ Scenario 9: Student access verification detects expired workspace and restricts content (0.3ms)
  ✔ Scenario 10: Payment submission schema validates manual bank transfer proof on expired workspaces (1.3ms)
  ✔ Scenario 11: Status 'pending_payment' does NOT activate workspace subscription (2.0ms)
  ✔ Scenario 12: Admin payment approval activates subscription with 30-day period starting from verification time (0.3ms)
  ✔ Scenario 13: Payment rejection leaves subscription inactive / expired (0.1ms)
  ✔ Scenario 14: Normalized email hash matching existing trial claim denies second trial (0.8ms)
  ✔ Scenario 15: Teacher in Tenant A cannot operate or submit payments for Tenant B (1.2ms)
  ✔ Scenario 16: Registration tracks created resources for rollback on mid-flight failure (0.3ms)
  ✔ Scenario 17: Non-admin caller is rejected from platform payment verification (0.3ms)
  ✔ Scenario 18: Provider-aware email canonicalization strips sub-addressing and Gmail dots (0.4ms)
  ✔ Scenario 19: Unverified registration does not provision workspace or start trial (0.1ms)
  ✔ Scenario 20: Verified educator triggers atomic workspace provisioning with 72-hour trial (0.1ms)
  ✔ Scenario 21: Server overrides spoofed client payment amount with authoritative plan catalog price (0.1ms)
  ✔ Scenario 22: Payment verification calls atomic RPC procedure admin_verify_subscription_payment (0.2ms)
  ✔ Scenario 23: Student catalog detects inactive/expired workspace and shields lesson/note access (0.2ms)
  ✔ Scenario 24: Server provides bank transfer details without hardcoded client constants (0.2ms)
✔ Phase 3B2-C: Teacher Registration, 72-Hour Free Trial & Commercial Subscriptions (95ms)

ℹ tests 66
ℹ suites 4
ℹ pass 66
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 2126ms
```

### Static Analysis & Build Verification
1. `npx tsc --noEmit` $\rightarrow$ **0 errors**.
2. `npm run lint` $\rightarrow$ **0 errors, 0 warnings**.
3. `npm run build` $\rightarrow$ **Compiled in 3.7s; 33/33 static pages generated successfully**.

---

## 5. Artifacts and File Links

The complete remediation consists of the following key files:
- [canonical.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/auth/canonical.ts) — Provider-aware email canonicalization and SHA-256 hashing.
- [payment.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/lib/config/payment.ts) — Server-side bank transfer configuration module.
- [00018_atomic_workspace_provisioning_and_storage.sql](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/supabase/migrations/00018_atomic_workspace_provisioning_and_storage.sql) — Atomic workspace provisioning procedure and private storage bucket RLS.
- [auth.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/auth.ts) — Two-stage educator onboarding and email verification enforcement.
- [subscriptions.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/actions/subscriptions.ts) — Atomic payment verification RPC invocation and server-bound pricing.
- [RegisterForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(auth)/register/_components/RegisterForm.tsx) — Email verification pending screen and resend confirmation UI.
- [SubscriptionPaymentForm.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(teacher)/dashboard/subscription/_components/SubscriptionPaymentForm.tsx) — Dynamic bank instructions from server config.
- [lessons/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(student)/home/lessons/page.tsx) — Student lesson catalog protection on expired workspaces.
- [notes/page.tsx](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/app/(student)/home/notes/page.tsx) — Student note catalog protection on expired workspaces.
- [trial-subscription.test.ts](file:///c:/Users/E-TEC/Desktop/FREELANCING%20PROJECTS/EDVORA%20-%20Learning%20Management%20System/edvora/tests/saas/trial-subscription.test.ts) — 24 test scenarios verifying trial, payment, and security hardening.

---

## 6. Pre-Production Staging Recommendations

Before deploying migrations to a live Supabase production instance:
1. **Configure Free SMTP Relay in Supabase:**
   In Supabase Web Console (`Project Settings -> Auth -> SMTP Settings`), connect a free transactional SMTP relay such as **Brevo (300 free emails/day)** or **Resend (3,000 free emails/month)** to ensure confirmation emails deliver reliably.
2. **Apply Migrations in Exact Sequence:**
   Apply migrations `00007` through `00018` in numbered order against a staging instance.
3. **Database Keep-Alive Ping:**
   Configure a free monitoring ping (e.g. UptimeRobot) hitting `/api/health` every 48 hours to prevent Supabase Free 7-day inactivity project auto-pausing.
4. **Commercially Compliant Hosting Transition:**
   Plan migration from Vercel Hobby to Cloudflare Pages or a low-cost VPS once commercial tuition operations launch.
