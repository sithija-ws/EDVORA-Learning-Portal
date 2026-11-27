# Edvora — Phase 3B2-C Independent Security & Commercial Readiness Review
## Teacher Registration, 72-Hour Free Trial & Commercial Subscription Activation

**Review Date:** 2026-11-24  
**Auditor:** Senior SaaS Security Engineer & PostgreSQL/Supabase Architect  
**Classification:** Independent Application Security & Architecture Audit  
**Scope:** Phase 3B2-C implementation, migrations `00007`–`00017`, `actions/auth.ts`, `actions/subscriptions.ts`, `lib/auth/tenant.ts`, student learning gates, and zero-budget hosting feasibility.  
**Mode:** STRICT READ-ONLY AUDIT (Zero source code altered, zero SQL executed, zero migrations applied).  

---

## Executive Summary

Phase 3B2-C introduces a multi-tenant teacher registration portal, automated 72-hour trial provisioning, trial abuse tracking via SHA-256 identity hashing, and a manual bank transfer subscription activation workflow.

The architecture succeeds in enforcing **zero-background worker dependencies**, relying entirely on server-side PostgreSQL timestamps (`clock_timestamp()`) and just-in-time application authorization gates. All 59 tests in the test suite pass, static analysis compiles cleanly without errors or warnings, and the Next.js production build succeeds across 33 routes.

However, this independent audit has identified **1 Critical finding, 2 High findings, 2 Medium findings, 2 Low findings, and 3 Informational findings**. The most severe issues concern **unverified email account pre-confirmation (`email_confirm: true`) leading to account squatting and trial exhaustion**, **email sub-addressing ("plus-addressing") bypassing trial abuse limits**, and **Vercel Hobby Terms of Service prohibiting commercial SaaS operation**.

**Final Review Verdict:** **`CORRECTIONS REQUIRED`**

---

## Finding Summary Matrix

| Finding ID | Severity | Category | Description | Status |
|---|---|---|---|---|
| **SEC-3B2C-CRIT-01** | **CRITICAL** | Authentication / Abuse | `email_confirm: true` permits unverified email registration, account squatting, and trial exhaustion | Open |
| **SEC-3B2C-HIGH-01** | **HIGH** | Trial Abuse Defense | Email sub-addressing (`user+tag@domain`) bypasses SHA-256 trial claim uniqueness | Open |
| **SEC-3B2C-HIGH-02** | **HIGH** | Commercial Compliance | Vercel Hobby Terms of Service explicitly prohibit commercial SaaS operation | Open |
| **SEC-3B2C-MED-01** | **MEDIUM** | Concurrency / Atomicity | Non-transactional multi-step provisioning across distributed HTTP REST calls | Open |
| **SEC-3B2C-MED-02** | **MEDIUM** | Data Privacy | Payment deposit receipts lack private storage bucket RLS policies | Open |
| **SEC-3B2C-LOW-01** | **LOW** | Financial Integrity | Client-controlled `amountLkr` in payment submission is not bound to server-side plan price | Open |
| **SEC-3B2C-LOW-02** | **LOW** | Maintainability | Commercial Bank transfer account details are hardcoded in client component | Open |
| **SEC-3B2C-INFO-01** | **INFORMATIONAL** | Student UX | Student catalog index pages display lesson/note metadata for expired workspaces | Open |
| **SEC-3B2C-INFO-02** | **INFORMATIONAL** | Infrastructure Risk | Supabase Free tier 7-day inactivity pause can disrupt active tuition workspaces | Open |
| **SEC-3B2C-INFO-03** | **INFORMATIONAL** | Audit Limitation | Verification is based purely on mock tests; zero tests run against live PostgreSQL RLS | Open |

---

## Detailed Audit Findings

### FINDING 1 — SEC-3B2C-CRIT-01: Unverified Email Registration, Account Squatting & Trial Exhaustion (`email_confirm: true`)

- **Severity:** **CRITICAL**
- **Affected File:** `actions/auth.ts:450-458`
- **Component:** `registerTeacher()` Server Action

#### Technical Description
In `actions/auth.ts`, the teacher registration action provisions the Supabase Auth user via the service-role client with `email_confirm: true`:

```typescript
// actions/auth.ts:450-458
const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
  email: cleanEmail,
  password,
  email_confirm: true,
  user_metadata: {
    full_name: fullName,
    role: ROLES.TEACHER,
  },
});
```

This bypasses email verification entirely. The system immediately creates an authoritative `auth.users` row marked as confirmed, provisions a tenant workspace, and records an introductory trial claim in `teacher_trial_claims` under `sha256(cleanEmail)`.

#### Realistic Exploitation Scenario
1. **Targeted Denial of Service & Identity Squatting:** An attacker or disgruntled competitor registers the real email addresses of prominent tuition teachers (e.g. `dr.perera@gmail.com`).
2. **Account Hijacking & Trial Exhaustion:** The attacker sets an arbitrary password. A trial claim is inserted into `teacher_trial_claims`.
3. **Lockout:** When the legitimate educator visits Edvora to sign up, their registration is rejected with:
   `"An account with this email address already exists. Please log in."`
4. **Permanent Trial Loss:** Even if the legitimate teacher uses password reset to recover the auth account, the 72-hour trial has already elapsed in the past under the impersonator's registration, permanently depriving the real teacher of their introductory trial.

#### Recommended Correction
Do not silently bypass email verification without verifying email ownership. To remain within the zero-budget constraint on Supabase Free:
1. **Free SMTP Relay:** Connect a zero-cost transactional SMTP provider in the Supabase Dashboard (`Project Settings -> Auth -> SMTP Settings`). Providers such as **Brevo (formerly Sendinblue)** offer **300 free emails per day**, or **Resend** offers **100 free emails per day (3,000/month)**.
2. **Two-Stage Onboarding:**
   - On initial registration, create the user with `email_confirm: false` (or standard `supabase.auth.signUp()`).
   - The workspace subscription is initialized with status `'pending'`.
   - The 72-hour trial begins **only when the teacher clicks the verification email link or enters an OTP** (`email_confirmed_at IS NOT NULL`).

---

### FINDING 2 — SEC-3B2C-HIGH-01: Email Sub-Addressing ("Plus-Addressing") Bypasses Trial Abuse Prevention

- **Severity:** **HIGH**
- **Affected Files:** `actions/auth.ts:389-390`, `supabase/migrations/00017_trial_and_teacher_registration.sql:35-47`
- **Component:** `teacher_trial_claims` normalization logic

#### Technical Description
In `actions/auth.ts`:
```typescript
const cleanEmail = email.trim().toLowerCase();
const normalizedEmailHash = createHash("sha256").update(cleanEmail).digest("hex");
```
The normalization performs `trim().toLowerCase()`. However, standard email specifications and major email providers (Gmail, Google Workspace, Outlook, ProtonMail, iCloud) support **sub-addressing / plus-addressing** (`username+tag@domain.com`). In Gmail, periods (`.`) in the username are also completely ignored.

Because SHA-256 hashes the raw string, `teacher@gmail.com`, `teacher+1@gmail.com`, and `t.e.a.c.h.e.r@gmail.com` generate three completely different hashes:
- `sha256("teacher@gmail.com")` = `5678...`
- `sha256("teacher+trial1@gmail.com")` = `9abc...`
- `sha256("teacher+trial2@gmail.com")` = `3def...`

#### Realistic Exploitation Scenario
A tuition teacher registers using `teacher+trial1@gmail.com`, uses the 72-hour trial, exports their materials, and registers `teacher+trial2@gmail.com`. They repeat this indefinitely. The unique constraint on `teacher_trial_claims.normalized_email_hash` is never triggered because every hash is distinct. The teacher obtains lifetime free service.

#### Recommended Correction
Harden email normalization before computing the SHA-256 hash:
```typescript
function canonicalizeEmail(email: string): string {
  const [localPart, domain] = email.trim().toLowerCase().split("@");
  if (!localPart || !domain) return email.trim().toLowerCase();

  let cleanLocal = localPart.split("+")[0]; // Strip plus-addressing tags
  if (domain === "gmail.com" || domain === "googlemail.com") {
    cleanLocal = cleanLocal.replace(/\./g, ""); // Strip Gmail dots
  }
  return `${cleanLocal}@${domain}`;
}
```

---

### FINDING 3 — SEC-3B2C-HIGH-02: Commercial SaaS Operation Violates Vercel Hobby Terms of Service

- **Severity:** **HIGH / COMMERCIAL RISK**
- **Affected Area:** Production Infrastructure & Hosting Agreement
- **Component:** Vercel Hobby Plan Terms of Service

#### Technical Description
Edvora is an explicitly commercial multi-tenant SaaS application charging tuition teachers recurring fees (LKR 2,600 / LKR 5,000 / LKR 8,000 per month).

Section 1.3 of the **Vercel Terms of Service** and the **Vercel Fair Use Policy** state:
> *"The Hobby Services are intended only for personal, non-commercial use. You may not use Hobby Services for any commercial purpose, including but not limited to hosting an application for a commercial business, company, or paid SaaS."*

Operating a paid SaaS platform on Vercel Hobby creates an active terms-of-service violation. Vercel utilizes automated traffic analysis, domain reputation scans, and commercial pattern matching. Accounts found operating commercial services on the Hobby plan face **immediate suspension without grace periods** or forced upgrades to Vercel Pro ($20/team member/month).

#### Recommended Zero-Cost / Compliant Alternatives
To maintain zero infrastructure costs legally without violating hosting terms:
1. **Cloudflare Pages + Workers:** Cloudflare Pages Free Tier explicitly permits commercial use, provides unlimited bandwidth, and operates a global edge network at zero cost.
2. **Fly.io / Render Free Tier:** Compliant usage-based micro-tiers for non-enterprise commercial applications.
3. **Dedicated VPS (Hetzner / OVH ~$3.50–$4.50/month):** If a minimal budget is established from the first paying teacher, hosting Next.js on a single low-cost Linux VPS via Coolify or Docker removes all third-party hosting terms restrictions.

---

### FINDING 4 — SEC-3B2C-MED-01: Non-Transactional Multi-Step Provisioning Across Distributed HTTP REST Calls

- **Severity:** **MEDIUM**
- **Affected Files:** `actions/auth.ts:448-593`, `actions/subscriptions.ts:240-285`
- **Component:** Registration and payment approval orchestration

#### Technical Description
In `actions/auth.ts`, registration executes 6 separate sequential HTTP calls to the Supabase PostgREST API:
1. `adminClient.auth.admin.createUser`
2. `adminClient.from("profiles").upsert`
3. `adminClient.from("tenants").insert`
4. `adminClient.from("tenant_members").insert`
5. `adminClient.from("teacher_trial_claims").insert`
6. `adminClient.from("tenant_subscriptions").insert`

These operations do not run inside a single PostgreSQL transaction (`BEGIN ... COMMIT`). While an application-level `try ... catch` rollback block was added (lines 596–611), a Vercel serverless function termination (e.g. 10s execution ceiling timeout or container recycle) will abort execution midway.

Similarly, in `actions/subscriptions.ts`, `adminVerifyPayment()` updates `subscription_payments` and `tenant_subscriptions` in separate HTTP calls rather than invoking the atomic PostgreSQL procedure `public.admin_verify_subscription_payment()`.

#### Recommended Correction
1. **Registration:** Move workspace creation, owner membership, trial claim, and trial subscription initialization into a single atomic PostgreSQL stored procedure:
   `public.provision_tenant_workspace(p_user_id, p_workspace_name, p_slug, p_email_hash)`
2. **Payment Verification:** Replace the separate REST calls in `actions/subscriptions.ts` with a direct call to the already prepared procedure:
   `await supabase.rpc("admin_verify_subscription_payment", { p_payment_id: paymentId, p_approve: approve, ... })`.

---

### FINDING 5 — SEC-3B2C-MED-02: Payment Deposit Receipts Lack Private Storage Bucket RLS Policies

- **Severity:** **MEDIUM**
- **Affected Files:** `supabase/migrations/00012_storage_tenant_policies.sql`, `app/(teacher)/dashboard/subscription/_components/SubscriptionPaymentForm.tsx:165-177`
- **Component:** Storage bucket policies and payment proof uploads

#### Technical Description
Migration `00012` configures storage RLS policies exclusively for `bucket_id = 'notes'`. No storage bucket or RLS policies exist in migrations `00007`–`00017` for payment proofs or deposit receipts.

In `SubscriptionPaymentForm.tsx`, teachers submit a `slipUrl`. If a storage bucket named `payment_slips` is created in Supabase without explicit private RLS policies, or if `notes` is used, payment slips containing sensitive personal banking information (account numbers, depositor names, branch locations, transaction timestamps) could either be blocked or uploaded to a public bucket where they can be enumerated over the public CDN.

#### Recommended Correction
Prepare a dedicated storage migration for payment proofs:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('payment_slips', 'payment_slips', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "payment_slips_upload_tenant_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment_slips'
    AND public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
  );

CREATE POLICY "payment_slips_select_authorized"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment_slips'
    AND (
      public.has_tenant_role(public.try_cast_uuid(split_part(name, '/', 1)), 'admin')
      OR public.is_platform_admin()
    )
  );
```

---

### FINDING 6 — SEC-3B2C-LOW-01: Client-Controlled Payment Amount Without Server-Side Plan Price Binding

- **Severity:** **LOW**
- **Affected Files:** `actions/subscriptions.ts:38`, `actions/subscriptions.ts:101`
- **Component:** `submitSubscriptionPayment()` Server Action

#### Technical Description
In `actions/subscriptions.ts`, `amountLkr` is parsed from client form data and passed directly into the `subscription_payments` insert:
```typescript
const { planCode, billingCycle, amountLkr, referenceNumber, slipUrl, notes } = parseResult.data;
...
const { data: payment, error: payErr } = await adminClient
  .from("subscription_payments")
  .insert({
    tenant_id: context.tenantId,
    subscription_id: currentSub.id,
    plan_id: plan.id,
    amount_lkr: amountLkr, // <--- Client-provided value
```
Although `subscription_plans` is queried for `plan.price_lkr_monthly`, the code does not verify that `amountLkr` matches the actual price of the selected plan. A caller can submit `amountLkr = 1.00` for the Pro plan (LKR 8,000). While status remains `pending` until admin approval, the database stores misleading audit data and creates a risk if an administrator verifies payments by referencing the database column rather than the physical slip.

#### Recommended Correction
Bind `amount_lkr` strictly on the server:
```typescript
const payableAmount = billingCycle === "annual" && plan.price_lkr_annual
  ? plan.price_lkr_annual
  : plan.price_lkr_monthly;

amount_lkr: payableAmount,
```

---

### FINDING 7 — SEC-3B2C-LOW-02: Hardcoded Commercial Bank Transfer Details in Client Component

- **Severity:** **LOW / CONFIGURATION RISK**
- **Affected File:** `app/(teacher)/dashboard/subscription/_components/SubscriptionPaymentForm.tsx:135-150`
- **Component:** Bank instruction presentation

#### Technical Description
The bank account number (`8010045678`), bank name, account holder (`Edvora Technologies (Pvt) Ltd`), and branch are hardcoded directly into the JSX markup of `SubscriptionPaymentForm.tsx`.

#### Technical Consequences
Any change in corporate bank accounts, branch assignments, or account numbers requires a source code edit, git commit, and full Next.js rebuild.

#### Recommended Correction
Externalize bank transfer details to environment variables (e.g. `NEXT_PUBLIC_BANK_NAME`, `NEXT_PUBLIC_BANK_ACCOUNT_NO`) or store them in a platform configuration table.

---

### FINDING 8 — SEC-3B2C-INFO-01: Student Catalog Index Routes Display Metadata for Expired Workspaces

- **Severity:** **INFORMATIONAL**
- **Affected Files:** `app/(student)/home/lessons/page.tsx`, `app/(student)/home/notes/page.tsx`
- **Component:** Student lessons and notes directory views

#### Technical Description
While the protected lesson watch console (`/home/lessons/[lessonId]`) and study note viewer (`/home/notes/[noteId]`) strictly verify active subscription status and return 404 if the trial is expired, the index directory pages (`/home/lessons`, `/home/notes`) query enrolled batches and render lesson cards and note cards regardless of workspace subscription status.

When students click on a lesson or note card in an expired workspace, they are redirected to a 404 page. While core educational materials (video player, PDF documents) are completely protected, the UI experience is confusing.

#### Recommended Correction
Add a subscription status check in `/home/lessons` and `/home/notes` to render a clean workspace expiration notice instead of broken card links.

---

### FINDING 9 — SEC-3B2C-INFO-02: Supabase Free Tier 7-Day Inactivity Auto-Pausing Risk

- **Severity:** **INFORMATIONAL / OPERATIONAL RISK**
- **Affected Area:** Database Availability on Free Tier
- **Component:** Supabase Free Project Management

#### Technical Description
Supabase Free tier projects are automatically paused after **7 consecutive days of database inactivity**. When paused:
- The database is shut down.
- Incoming API requests and webhooks fail with 503 Service Unavailable.
- Restoring the database requires a manual platform administrator login to the Supabase web console and clicking "Restore project" (taking several minutes).

If a tuition teacher registers right before a school vacation or exam break and students have no activity for 7 days, the database will pause, causing sudden downtime when classes resume.

#### Recommended Correction
Set up a free external ping monitor (e.g. UptimeRobot or Cron-job.org free tier) hitting an unauthenticated health check endpoint (`/api/health`) that runs a lightweight query (`SELECT 1`) every 24–48 hours to keep the database active.

---

### FINDING 10 — SEC-3B2C-INFO-03: Mock-Only Verification: Zero Tests Executed Against Live PostgreSQL Engine

- **Severity:** **INFORMATIONAL / AUDIT LIMITATION**
- **Affected Area:** Quality Assurance & Test Classification
- **Component:** `tests/saas/trial-subscription.test.ts`

#### Technical Description
All 59 automated tests in the test suite are **in-memory unit/mock tests**. Per strict instructions, migrations `00007` through `00017` have **not been applied to any live PostgreSQL database**.

Therefore:
- Real PostgreSQL triggers (`trg_sub_active_*`, `trg_check_student_quota`) have not fired on a real database engine.
- Row-level locking (`FOR UPDATE OF ts`) and transaction isolation have not been tested under concurrent load.
- Real Supabase Auth JWT cryptographic signature validation has not been exercised against production token headers.

#### Recommended Correction
Before opening commercial registration to real educators, execute migrations `00007`–`00017` in a local Supabase CLI environment or a dedicated staging database and run end-to-end integration tests.

---

## Comprehensive Security Analysis by Domain

### 1. Subscription Lifecycle & Expiry Enforcement
The four-state lifecycle (`trialing → expired → pending_payment → active`) is correctly implemented:
- **72-Hour Boundary:** Expiry is strictly evaluated against `clock_timestamp()` and server Date. Browser clock manipulation is completely ineffective.
- **Content Mutation Gating:** Every mutating Server Action across batches, lessons, notes, announcements, and student enrollments calls `requireActiveSubscription()`.
- **Database Triggers:** Migration `00014` installs `enforce_active_subscription_for_mutations()` and `enforce_tenant_student_quota()` which evaluate `is_tenant_subscription_active()` on `INSERT` and `UPDATE`.

### 2. Payment Security & Platform Admin Authorization
- **Platform Admin Enforcement:** Both `actions/subscriptions.ts:adminVerifyPayment()` and `public.admin_verify_subscription_payment()` enforce that the caller belongs to `public.platform_admins`.
- **Anti-Self-Activation:** Teachers cannot set their own subscription status or approve their own payments. RLS policies on `tenant_subscriptions` and `subscription_payments` restrict mutations to platform admins.
- **Verification Period Calculation:** Upon approval, the 30-day period begins from `clock_timestamp()` (verification time), ensuring educators receive the full 30 days rather than backdating to trial start.
- **Rejection Behavior:** Payment rejection explicitly transitions subscription status to `'expired'`.

### 3. Tenant Isolation
- **Workspace Scoping:** All operations strictly derive `tenantId` from `requireTenantContext()`. Client-supplied tenant IDs in request bodies or query parameters are ignored.
- **Cross-Tenant Access:** Forged cookie hints are rejected against server database records. Instructors in Tenant A cannot submit payments or manage content in Tenant B.

---

## Final Review Verdict

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                   CORRECTIONS REQUIRED                      │
│                                                             │
│  Phase 3B2-C has established a solid architectural          │
│  foundation for 72-hour trial and billing management.       │
│  However, production staging is BLOCKED until Finding 1     │
│  (unverified email registration) and Finding 2 (email       │
│  sub-addressing trial abuse) are remediated, and a legal    │
│  hosting strategy compliant with commercial terms is        │
│  selected.                                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Action Items Prior to Staging Approval:
1. **Remediate SEC-3B2C-CRIT-01:** Connect a free SMTP provider (Brevo/Resend) in Supabase and require email verification before activating introductory trials.
2. **Remediate SEC-3B2C-HIGH-01:** Implement email canonicalization (strip sub-addressing `+` tags and Gmail dots) before SHA-256 hashing.
3. **Remediate SEC-3B2C-HIGH-02:** Select a commercially compliant zero-cost hosting provider (Cloudflare Pages) or budget for Vercel Pro.
4. **Remediate SEC-3B2C-MED-01:** Use the atomic `admin_verify_subscription_payment` RPC in `actions/subscriptions.ts`.
5. **Remediate SEC-3B2C-LOW-01:** Bind `amount_lkr` to `plan.price_lkr_monthly` on the server.
