# Edvora — Phase 3B2-C.2 Independent Security Re-Audit
## Teacher Registration, Trial Lifecycle & Commercial Subscriptions

**Review Date:** 2026-11-24  
**Auditor:** Senior SaaS Security & Database Systems Auditor  
**Classification:** Independent Application Security & Architecture Audit  
**Scope:** Phase 3B2-C.1 implementation, migrations `00007`–`00018`, `actions/auth.ts`, `actions/subscriptions.ts`, `lib/auth/canonical.ts`, `lib/config/payment.ts`, storage policies, student learning gates, and zero-budget hosting feasibility.  
**Mode:** STRICT READ-ONLY AUDIT (Zero source code altered, zero SQL executed, zero migrations applied).  

---

## Executive Summary

Phase 3B2-C.1 introduced significant architectural improvements: removing the dangerous `email_confirm: true` bypass, enforcing a two-stage registration workflow, introducing provider-aware email canonicalization (`lib/auth/canonical.ts`), externalizing banking instructions (`lib/config/payment.ts`), shielding the student catalog from expired workspaces, and encapsulating workspace provisioning into an atomic PostgreSQL procedure (`public.provision_tenant_workspace`).

All 66 automated tests pass, TypeScript compiles with 0 errors, ESLint reports 0 warnings/errors, and the Next.js production build compiles cleanly across 33 routes.

However, an independent code inspection of the actual implementation reveals **1 High finding, 2 Medium findings, 3 Low findings, and 2 Informational observations**. The most notable security issues involve **excessive `EXECUTE` privileges on `public.provision_tenant_workspace` allowing direct client RPC invocation with forged email hashes**, **trusting client-modifiable user metadata (`meta.canonical_email_hash`) over verified auth identities**, and **profile tampering on duplicate registration attempts due to Supabase email enumeration defense behavior**.

**Final Review Verdict:** **`CORRECTIONS REQUIRED`**

---

## Finding Summary Matrix

| Finding ID | Severity | Category | Description | Blocks Staging? | Status |
|---|---|---|---|---|---|
| **SEC-3B2C2-HIGH-01** | **HIGH** | Authorization / RPC | `provision_tenant_workspace` granted to `authenticated` with client-controlled `p_canonical_email_hash` | **YES** | Open |
| **SEC-3B2C2-MED-01** | **MEDIUM** | Auth Metadata | `signIn()` prioritizes client-modifiable `user_metadata.canonical_email_hash` over verified `auth.users.email` | **YES** | Open |
| **SEC-3B2C2-MED-02** | **MEDIUM** | Identity Integrity | Duplicate registration upserts `profiles.full_name` on existing users without authentication | **YES** | Open |
| **SEC-3B2C2-LOW-01** | **LOW** | Storage Security | `payment_slips` bucket lacks storage-level MIME type and file size constraints | No (Blocks Prod) | Open |
| **SEC-3B2C2-LOW-02** | **LOW** | Financial Ops | Production banking configuration falls back to dummy placeholder account (`8010045678`) | No (Blocks Prod) | Open |
| **SEC-3B2C2-LOW-03** | **LOW** | Concurrency | `admin_verify_subscription_payment` lacks row-level locking (`FOR UPDATE`) on payment records | No (Blocks Prod) | Open |
| **SEC-3B2C2-INFO-01** | **INFORMATIONAL** | Infrastructure | Supabase Free default mailer rate limits (~3–4 emails/hr) will fail registration without custom SMTP | No | Documented |
| **SEC-3B2C2-INFO-02** | **INFORMATIONAL** | QA Classification | 100% of test suite (66/66) consists of mocked unit/contract tests; zero live PostgreSQL integration tests | No | Documented |

---

## Detailed Audit Findings

### FINDING 1 — SEC-3B2C2-HIGH-01: `provision_tenant_workspace` Granted to `authenticated` with Client-Controlled `p_canonical_email_hash`

- **Severity:** **HIGH**
- **Affected File:** `supabase/migrations/00018_atomic_workspace_provisioning_and_storage.sql:83-88, 345`
- **Component:** `public.provision_tenant_workspace()` Stored Procedure
- **Blocks Staging:** **YES**

#### Technical Explanation
In migration `00018`, the stored procedure is defined with `p_canonical_email_hash TEXT` as an input parameter and granted to the `authenticated` role:
```sql
-- Lines 83-88
CREATE OR REPLACE FUNCTION public.provision_tenant_workspace(
  p_user_id              UUID,
  p_workspace_name       TEXT,
  p_workspace_slug       TEXT,
  p_canonical_email_hash TEXT
) ...
-- Line 345
GRANT EXECUTE ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
```
Inside the function:
```sql
-- Line 118
v_caller_id := (SELECT auth.uid());
IF v_caller_id IS NOT NULL AND v_caller_id != p_user_id AND NOT public.is_platform_admin() THEN
  RAISE EXCEPTION 'Access denied. You may only provision a workspace for your own account.'
    USING ERRCODE = '42501';
END IF;
...
-- Line 181
SELECT c.id INTO v_existing_claim_id
FROM public.teacher_trial_claims c
WHERE c.normalized_email_hash = p_canonical_email_hash;
```
Because `EXECUTE` is granted to `authenticated`, any authenticated user (e.g. from the browser via `supabase.rpc()`) can invoke the PostgREST RPC endpoint directly. When an authenticated user calls `provision_tenant_workspace`, `v_caller_id` equals `p_user_id`, passing the authorization check. 

Crucially, **the procedure trusts `p_canonical_email_hash` directly from the caller's parameter**. An educator who already used their 72-hour trial can pass a random or newly generated SHA-256 string for `p_canonical_email_hash`. Because the random string does not exist in `teacher_trial_claims`, the procedure grants a fresh 72-hour free trial (`status: 'trialing'`).

Furthermore, in the application architecture, Server Actions (`registerTeacher` and `signIn`) invoke this RPC via `adminClient`, which connects with `service_role`. There is no legitimate architectural reason for client-side `authenticated` users to have direct `EXECUTE` privileges on this function.

#### Exploitation Scenario
1. Educator `teacher@gmail.com` creates an account, completes their 72-hour trial, and the workspace expires.
2. The educator registers a second account (`teacher+alt@gmail.com`).
3. Rather than letting the server compute the hash, the educator opens browser DevTools or a script and executes:
   ```javascript
   await supabase.rpc('provision_tenant_workspace', {
     p_user_id: user.id,
     p_workspace_name: 'Academy Alt',
     p_workspace_slug: 'academy-alt',
     p_canonical_email_hash: 'spoofed_random_hash_abc123'
   });
   ```
4. The database verifies that `'spoofed_random_hash_abc123'` has not claimed a trial.
5. The educator successfully acquires another introductory 72-hour trial, completely bypassing the trial abuse registry.

#### Recommended Correction
1. Revoke `EXECUTE` on `provision_tenant_workspace` from `authenticated`. Grant it **strictly** to `service_role`:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.provision_tenant_workspace(UUID, TEXT, TEXT, TEXT) TO service_role;
   ```
2. Defense-in-depth: In `provision_tenant_workspace`, derive or verify the canonical email hash from `auth.users.email` directly rather than accepting an unvalidated parameter:
   ```sql
   -- Query authoritative email from Supabase Auth
   SELECT email INTO v_auth_email FROM auth.users WHERE id = p_user_id;
   -- Validate or compute hash internally
   ```

---

### FINDING 2 — SEC-3B2C2-MED-01: `signIn()` Prioritizes Client-Modifiable `user_metadata.canonical_email_hash` over Verified Identity

- **Severity:** **MEDIUM**
- **Affected File:** `actions/auth.ts:312-314`
- **Component:** `signIn()` Server Action (Two-Stage Onboarding Flow)
- **Blocks Staging:** **YES**

#### Technical Explanation
In `actions/auth.ts`, when a verified teacher logs in for the first time without an existing membership, the action resolves the canonical email hash as follows:
```typescript
// actions/auth.ts:311-314
const meta = authData.user.user_metadata ?? {};
const wsName = meta.pending_workspace_name || `${profile.full_name || "Teacher"}'s Academy`;
const wsSlug = meta.pending_workspace_slug || `academy-${Date.now()}`;
const emailHash =
  meta.canonical_email_hash || getCanonicalEmailHash(authData.user.email ?? targetAuthEmail);
```
In Supabase Auth, `user.user_metadata` is **client-writable by default** via `supabase.auth.updateUser({ data: { canonical_email_hash: "tampered" } })`.

Because `signIn()` evaluates `meta.canonical_email_hash` **first**, any value stored in `user_metadata` takes precedence over `getCanonicalEmailHash(authData.user.email)`. An educator whose email was previously trialed can update their `user_metadata` before logging in, injecting a spoofed hash that tricks the provisioning logic into granting a free trial.

#### Exploitation Scenario
1. Teacher has exhausted their trial on `teacher@gmail.com`.
2. Teacher signs up with `teacher+2@gmail.com`.
3. Before signing in, the teacher calls `supabase.auth.updateUser({ data: { canonical_email_hash: "0000000000000000000000000000000000000000000000000000000000000000" } })`.
4. Teacher logs in at `/login`.
5. `signIn()` reads `meta.canonical_email_hash` ("00000..."), ignores the actual `authData.user.email`, and provisions an active 72-hour trial.

#### Recommended Correction
Do not trust or read `canonical_email_hash` from `user_metadata`. Derive it strictly and authoritatively from the verified `authData.user.email`:
```typescript
// Always compute dynamically from the verified email identity:
const emailHash = getCanonicalEmailHash(authData.user.email ?? targetAuthEmail);
```

---

### FINDING 3 — SEC-3B2C2-MED-02: Profile Tampering on Duplicate Registration Due to Supabase Obfuscation

- **Severity:** **MEDIUM**
- **Affected File:** `actions/auth.ts:503-549`
- **Component:** `registerTeacher()` Server Action
- **Blocks Staging:** **YES**

#### Technical Explanation
In `actions/auth.ts:registerTeacher()`:
```typescript
const { data: authData, error: authErr } = await supabase.auth.signUp({
  email: cleanEmail,
  password,
  options: { ... },
});

if (authErr) { ... }

if (!authData?.user) { ... }

// Create or upsert teacher profile
await adminClient.from("profiles").upsert({
  id: authData.user.id,
  full_name: fullName,
  role: ROLES.TEACHER,
  is_active: true,
});
```
In Supabase Auth, when email enumeration defense is enabled (default behavior), calling `supabase.auth.signUp()` for an **already registered email address does NOT return an error**. Instead, Supabase returns a dummy user object where `authData.user.identities` is an **empty array** (`[]`).

Because `authErr` is null and `authData.user` is defined, execution continues to line 544. The action executes:
`await adminClient.from("profiles").upsert({ id: authData.user.id, full_name: fullName, ... })`.

If an attacker registers using the email of an existing teacher and specifies a malicious `fullName` (e.g. "Prof. Impersonator"), the server executes `adminClient.from("profiles").upsert` using the existing teacher's UUID (`authData.user.id`), **overwriting the legitimate teacher's profile full name without authentication or email verification**.

#### Exploitation Scenario
1. Dr. Silva is an existing registered teacher on Edvora (`dr.silva@gmail.com`).
2. An unauthenticated attacker visits `/register`, enters `dr.silva@gmail.com`, and inputs `fullName: "Account Suspended - Call 555-0199"`.
3. Supabase Auth returns `{ user: { id: "dr-silva-uuid", identities: [] } }` to prevent email enumeration.
4. `registerTeacher()` receives this object and upserts `profiles` where `id = 'dr-silva-uuid'`.
5. Dr. Silva's profile name in the database and across all student batches is instantly changed to "Account Suspended - Call 555-0199".

#### Recommended Correction
Detect existing accounts by checking `identities.length`:
```typescript
if (authData.user && (!authData.user.identities || authData.user.identities.length === 0)) {
  // User already exists; Supabase obfuscated the response.
  // DO NOT touch public.profiles. Return safe message.
  return {
    success: false,
    data: null,
    error: "An account with this email address already exists. Please log in.",
  };
}
```

---

### FINDING 4 — SEC-3B2C2-LOW-01: Storage Bucket Lacks File Size and MIME Type Restrictions

- **Severity:** **LOW / STORAGE HYGIENE**
- **Affected File:** `supabase/migrations/00018_atomic_workspace_provisioning_and_storage.sql:16-40`
- **Component:** `storage.buckets` (`payment_slips`)
- **Blocks Staging:** No (Blocks Production Launch)

#### Technical Explanation
In migration `00018`:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment_slips', 'payment_slips', false)
ON CONFLICT (id) DO UPDATE SET public = false;
```
Supabase Storage supports bucket-level configuration for `file_size_limit` (bytes) and `allowed_mime_types` (text array).
Because neither constraint is configured on the bucket or checked in the `payment_slips_upload_tenant_admin` RLS policy, authenticated tenant admins can upload:
1. Arbitrary non-image/non-document files (e.g. `.exe`, `.html`, `.svg`).
2. Extremely large files (e.g. 500MB video files mislabeled as slips), rapidly consuming Supabase Free tier's 1GB storage allotment.

#### Recommended Correction
Update the bucket configuration:
```sql
UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MB limit
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'payment_slips';
```

---

### FINDING 5 — SEC-3B2C2-LOW-02: Silent Fallback to Placeholder Bank Account Number

- **Severity:** **LOW / FINANCIAL RISK**
- **Affected File:** `lib/config/payment.ts:18-26`
- **Component:** `getBankTransferDetails()`
- **Blocks Staging:** No (Blocks Commercial Operation)

#### Technical Explanation
In `lib/config/payment.ts`:
```typescript
export function getBankTransferDetails(): BankTransferConfig {
  return {
    bankName: process.env.BANK_NAME || "Commercial Bank of Ceylon",
    branch: process.env.BANK_BRANCH || "Colombo Main Branch",
    accountName: process.env.BANK_ACCOUNT_NAME || "Edvora Technologies (Pvt) Ltd",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "8010045678",
    ...
  };
}
```
If a deployment fails to define `BANK_ACCOUNT_NUMBER` in production environment variables, the system silently serves the dummy account number `8010045678`. Tuition teachers attempting to activate their commercial tiers will deposit money into a non-existent account or an arbitrary stranger's account.

#### Recommended Correction
In production (`process.env.NODE_ENV === "production"`), if `BANK_ACCOUNT_NUMBER` is missing or contains the default placeholder, the payment submission screen should display an administrative warning ("Direct bank transfer details undergoing maintenance; please contact platform support") and disable the payment submission form rather than displaying false banking coordinates.

---

### FINDING 6 — SEC-3B2C2-LOW-03: `admin_verify_subscription_payment` Missing Row-Level Lock (`FOR UPDATE`)

- **Severity:** **LOW / CONCURRENCY HYGIENE**
- **Affected File:** `supabase/migrations/00017_trial_and_teacher_registration.sql:264-279`
- **Component:** `public.admin_verify_subscription_payment()`
- **Blocks Staging:** No (Blocks Production Launch)

#### Technical Explanation
In `admin_verify_subscription_payment`:
```sql
SELECT * INTO v_payment
FROM public.subscription_payments
WHERE id = p_payment_id;

IF v_payment.status != 'pending' THEN
  RAISE EXCEPTION 'Payment is already processed (Status: %).', v_payment.status;
END IF;

SELECT * INTO v_sub
FROM public.tenant_subscriptions
WHERE id = v_payment.subscription_id;
```
Neither query uses `FOR UPDATE`. If two platform administrators concurrently approve the same payment ticket at the exact same millisecond under `READ COMMITTED` isolation, both sessions can read `status = 'pending'`, calculate new periods, and extend the subscription twice.

#### Recommended Correction
Add `FOR UPDATE` to the record fetches:
```sql
SELECT * INTO v_payment
FROM public.subscription_payments
WHERE id = p_payment_id
FOR UPDATE;

SELECT * INTO v_sub
FROM public.tenant_subscriptions
WHERE id = v_payment.subscription_id
FOR UPDATE;
```

---

## Comprehensive Security Analysis by Domain

### 1. Registration & Auth Metadata Verification
- **Email Confirmation Enforcement:** `actions/auth.ts:registerTeacher()` no longer confirms accounts automatically. Unconfirmed signups receive `pendingVerification: true`, and no workspace or trial claim is provisioned.
- **Server-Side Validation:** All inputs are validated via Zod schemas (`registerTeacherSchema`, `loginSchema`).
- **PostgreSQL Slug Sanitization:** `provision_tenant_workspace()` sanitizes and forces lowercase slugs, ensuring unique constraint violations roll back cleanly.
- **Identity Check:** Verified Auth user identity is retrieved via `supabase.auth.getUser()`, which validates cryptographic JWT signatures against Supabase Auth.
- **Residual Flaw:** The procedure `provision_tenant_workspace()` is directly callable by `authenticated` users and trusts client-supplied `p_canonical_email_hash` (Finding 1), and `signIn()` trusts user-supplied metadata (Finding 2).

### 2. Email Canonicalization Audit (`lib/auth/canonical.ts`)
Each provider rule was verified against real-world mail server behavior:
- **Gmail / Googlemail:** Dots are stripped; plus-tags (`+tag`) are stripped; `googlemail.com` is standardized to `gmail.com`. **Correct.**
- **Microsoft (`outlook.com`, `hotmail.com`, `live.com`, `msn.com`):** Plus-tags are stripped; dots are preserved (dots are significant in Microsoft consumer mailboxes). **Correct.**
- **Proton (`protonmail.com`, `proton.me`, `pm.me`):** Plus-tags are stripped; dots are preserved. Domains are not merged (preventing collisions between distinct users holding identical usernames across Proton domains). **Correct.**
- **Apple iCloud (`icloud.com`, `me.com`, `mac.com`):** Plus-tags are stripped; dots are preserved. **Correct.**
- **Fastmail (`fastmail.com`, `fastmail.fm`):** Plus-tags are stripped; dots are preserved. **Correct.**
- **Custom / Institutional Domains:** Dots and plus characters are preserved intact.
- **Conclusion:** `canonical.ts` is conservative and **does not merge two genuinely distinct mailboxes**.

### 3. Workspace Provisioning RPC Audit
- `SECURITY DEFINER`: Present.
- `search_path`: Set to empty string (`SET search_path = ''`) with all table references fully qualified (`public.tenants`, `public.profiles`, etc.).
- Owner assignment: Strictly assigns role `'owner'` in `tenant_members`.
- Trial claim registry: Atomically inserts into `teacher_trial_claims`.
- Atomicity: Wrapped in a single PostgreSQL transaction function; any failure aborts all changes.
- **Vulnerability:** `GRANT EXECUTE ... TO authenticated` allows client-side tampering of the canonical email hash parameter (Finding 1).

### 4. Payment Verification Audit
- Platform admin enforcement: Strictly checks `public.is_platform_admin()`.
- Client price spoofing: In `actions/subscriptions.ts:submitSubscriptionPayment()`, `amount_lkr` is strictly derived from `plan.price_lkr_monthly` (or annual), completely ignoring client-supplied amounts.
- Duplicate approval protection: Rejects if status is not `'pending'`.
- Rejection safety: Rejection sets status `'rejected'` on payment and leaves subscription `'expired'`. Never activates.

### 5. Payment Slip Storage Audit
- Bucket privacy: `public = false`.
- Isolation: Path-prefixed policy `{tenant_id}/*` strictly checks `has_tenant_role(uuid, 'admin')`. Tenant B cannot read or overwrite Tenant A's receipts.
- Platform admin access: Authorized via `is_platform_admin()`.
- Deficiency: Missing bucket-level file size (5MB) and MIME type validation (Finding 4).

### 6. Bank Configuration Audit
- `lib/config/payment.ts` is executed strictly on the server in `page.tsx` and passed via props.
- No client-bundle secret leaks.
- Deficiency: Missing production guard against dummy placeholder account `8010045678` (Finding 5).

### 7. Trial & Subscription Enforcement Audit
- Expiry calculation: Uses `clock_timestamp()` on PostgreSQL and `new Date()` on server. Manipulating browser clocks has zero effect.
- Server Actions: Every mutating Server Action calls `requireActiveSubscription()`.
- Student isolation: `/home/lessons` and `/home/notes` check subscription validity and render an inactive banner if the academy is expired.
- Instructor billing access: `requireTenantContext()` allows expired workspace owners to access `/dashboard/subscription` and submit payment proofs.

### 8. Infrastructure Limitations on Supabase Free
- **Email Rate Limiting:** Supabase Free built-in SMTP allows only **3 to 4 emails per hour**. Running manual multi-user registration testing without an external SMTP provider will fail.
- **Free SMTP Solution:** In the Supabase Dashboard (`Project Settings -> Auth -> SMTP Settings`), connect a free transactional SMTP relay:
  - **Brevo (Sendinblue):** 300 free emails/day (no credit card required).
  - **Resend:** 100 free emails/day (3,000/month).
- **Inactivity Pausing:** Supabase pauses free projects after 7 consecutive days of inactivity. An unauthenticated `/api/health` ping every 48 hours is required to prevent tuition disruption during holidays.

---

## 9. Quality Assurance & Test Classification

All 66 tests executed in `npm run test:saas` were inspected and classified:

| Test File | Test Count | Classification | Remarks |
|---|---|---|---|
| `auth-foundation.test.ts` | 14 | **Mock-Based Unit / Query-Contract** | Simulates Supabase auth responses and permissions. |
| `actions-security.test.ts` | 11 | **Mock-Based Unit / Query-Contract** | Simulates Server Action authorization boundaries. |
| `student-auth-isolation.test.ts` | 17 | **Mock-Based Unit / Query-Contract** | Tests rate limiting logic, synthetic email mapping, and IP extraction. |
| `trial-subscription.test.ts` | 24 | **Mock-Based Unit / Logic Simulation** | Tests canonicalization rules, 72h math, and mock RPC parameter contracts. |

### Test Scope Summary:
- **Mock-based Unit & Contract Tests:** **66 (100%)**
- **Live PostgreSQL Integration Tests:** **0 (0%)**
- **Live Database Concurrency Tests:** **0 (0%)**
- **Manual Staging Tests:** **0 (0%)**

> [!WARNING]
> While all 66 mocked tests pass, **zero tests have been executed against a live PostgreSQL database engine or real Supabase Auth JWT validator**. In-memory mocks cannot verify database row-level locks, transaction isolation, PostgREST parameter parsing, or Supabase Auth rate limits. Staging validation against live Supabase remains mandatory.

---

## Final Review Verdict

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                   CORRECTIONS REQUIRED                      │
│                                                             │
│  Phase 3B2-C.1 remediated the primary email confirmation    │
│  bypass. However, staging validation is BLOCKED until       │
│  SEC-3B2C2-HIGH-01 (public RPC execution with forged        │
│  hash), SEC-3B2C2-MED-01 (metadata hash precedence), and   │
│  SEC-3B2C2-MED-02 (profile tampering on duplicate signup)  │
│  are corrected.                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Action Items Prior to Staging Approval:
1. **Remediate SEC-3B2C2-HIGH-01:** Restrict `provision_tenant_workspace` execute permissions strictly to `service_role`.
2. **Remediate SEC-3B2C2-MED-01:** Compute canonical email hash directly from `authData.user.email` in `signIn()`; never trust `user_metadata`.
3. **Remediate SEC-3B2C2-MED-02:** Check `identities.length === 0` in `registerTeacher()` to prevent overwriting existing user profiles on duplicate registration.
4. **Configure Free SMTP:** Set up Brevo or Resend in Supabase Auth settings to bypass the 3 email/hr limit.
