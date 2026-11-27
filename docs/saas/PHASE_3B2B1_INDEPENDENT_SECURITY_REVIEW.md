# EDVORA — PHASE 3B2-B.1 INDEPENDENT SECURITY RE-REVIEW

**Document ID**: `EDV-SaaS-3B2B1-SEC-001`  
**Review Type**: Independent Application Security Re-Review (Read-Only)  
**Date**: November 24, 2026  
**Auditor**: Senior Application Security Engineer & SaaS Architect  
**Target Codebase**: Edvora Multi-Tenant SaaS (Phase 3B2-B.1 Security Corrections)  
**Reference Report**: `docs/saas/PHASE_3B2B1_IMPLEMENTATION_REPORT.md`  
**Previous Audit**: `docs/saas/PHASE_3B2B_INDEPENDENT_SECURITY_REVIEW.md`  
**Final Verdict**: **CORRECTIONS REQUIRED**  

---

## 1. Executive Summary

This independent application security re-review evaluates the remediations implemented in Phase 3B2-B.1 addressing findings from Phase 3B2-B:

1. **Metadata Information Disclosure (SEC-3B2B-MED-01)**: **VERIFIED & REMEDIATED**. All 10 dynamic metadata generators across the `app/` hierarchy now implement strict pre-RLS authentication, workspace scoping, and entity ownership verification before emitting resource titles or student full names.
2. **Multi-Workspace Announcement Isolation (SEC-3B2B-LOW-01)**: **VERIFIED & REMEDIATED**. Announcement filtering on both the student announcements page and student home dashboard strictly scopes broadcast announcements to the workspace owning the selected batch (or workspaces where the student maintains active batch enrollments), preventing cross-tenant broadcast bleed.
3. **Production Rate Limiting (SEC-3B2B-MED-02)**: **PARTIALLY REMEDIATED WITH NEW OPEN DEFECTS**. While Database Migration `00016_auth_rate_limiting.sql` introduces a sound schema and PostgreSQL stored procedure architecture for distributed rate limiting, our security review identified three critical flaws:
   - **Fail-Open In-Memory Emergency Fallback (HIGH)**: `lib/auth/rate-limit.ts` implements an in-memory emergency fallback that catches database errors and permits authentication attempts (`allowed: true`) on fresh serverless instances. This directly violates the mandatory fail-closed security requirement and enables brute-force bypass during database connectivity issues or pool exhaustion.
   - **Initialization Concurrency Race in Migration 00016 (HIGH)**: `record_failed_rate_limit_attempt` executes `SELECT ... FOR UPDATE` followed by `INSERT` on uninitialized keys. In PostgreSQL `READ COMMITTED` transactions, `FOR UPDATE` on a non-existent row acquires no lock. Concurrent requests for a new key result in unhandled primary key unique constraint violations (`auth_rate_limits_pkey`), crashing the RPC call and triggering the fail-open fallback.
   - **Compound Keying Structure Permits Password Spraying (MEDIUM)**: Rate limit keys combine `(IP + Workspace + Username)`. An attacker can spray thousands of usernames from a single IP address without triggering any rate limit, as each username generates a distinct key hash.

Consequently, while metadata disclosure and announcement isolation are fully resolved, rate limiter flaws must be corrected before Phase 3B2-C can begin. The verdict is **CORRECTIONS REQUIRED**.

---

## 2. Security Findings & Detailed Analysis

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FINDINGS SUMMARY                                    │
├──────────────────────┬──────────┬───────────────────────┬──────────────────────────────┤
│ Finding ID           │ Severity │ Category              │ Status                       │
├──────────────────────┼──────────┼───────────────────────┼──────────────────────────────┤
│ SEC-3B2B1-HIGH-01    │ HIGH     │ Rate Limiting / DoS   │ Open (Violates Fail-Closed)  │
│ SEC-3B2B1-HIGH-02    │ HIGH     │ Concurrency / RDBMS   │ Open (Race Condition)        │
│ SEC-3B2B1-MED-01     │ MEDIUM   │ Abuse Prevention      │ Open (Password Spraying)     │
│ SEC-3B2B1-LOW-01     │ LOW      │ Reverse Proxy Trust   │ Open (Header Spoofing Risks) │
│ SEC-3B2B1-INFO-01    │ INFO     │ Testing Methodology   │ Open (Mocked Concurrency)    │
└──────────────────────┴──────────┴───────────────────────┴──────────────────────────────┘
```

---

### Finding SEC-3B2B1-HIGH-01: In-Memory Emergency Fallback Violates Fail-Closed Security

- **Severity**: **HIGH**
- **Affected File**: `lib/auth/rate-limit.ts`
- **Line References**: Lines 209–215, 258–264

#### Vulnerability Description
In `lib/auth/rate-limit.ts`, both `checkRateLimit` and `recordFailedAttempt` wrap PostgreSQL RPC calls in a `try/catch` block. When the database RPC fails (e.g. database connection down, migration 00016 unapplied, service key missing, connection pool exhausted, or network timeout), the implementation catches the error, outputs a `[SECURITY_WARNING]` console log, and falls back to an in-memory `Map` (`runEmergencyCheck` and `runEmergencyRecordFailed`):

```typescript
// lib/auth/rate-limit.ts:209-215
} catch (err: unknown) {
  console.warn(
    `[SECURITY_WARNING] PostgreSQL check_rate_limit unavailable (${err instanceof Error ? err.message : String(err)}). ` +
    `Engaging local emergency rate-limiting fallback. Ensure migration 00016 is applied in production.`
  );
  return runEmergencyCheck(keyHash, maxAttempts, windowSeconds, lockoutSeconds);
}
```

```typescript
// lib/auth/rate-limit.ts:101-112
function runEmergencyCheck(
  keyHash: string,
  maxAttempts: number,
  windowSeconds: number,
  lockoutSeconds: number
): RateLimitStatus {
  const now = Date.now();
  const record = emergencyStore.get(keyHash);

  if (!record) {
    return { allowed: true, remainingAttempts: maxAttempts };
  }
  // ...
```

#### Exploit / Failure Scenario
1. **Serverless Ephemerality**: In Vercel serverless environments, each incoming HTTP request can be routed to an independent, ephemeral container. Container lifecycles are brief, and memory is not shared across lambda instances.
2. **Fail-Open Behavior**: When a new container spins up and receives an authentication request while PostgreSQL is unreachable, `emergencyStore.get(keyHash)` is empty (`undefined`). `runEmergencyCheck` immediately returns `{ allowed: true, remainingAttempts: maxAttempts }`.
3. **Brute-Force Bypass**: An attacker conducting high-concurrency credential stuffing across parallel connections forces Vercel to scale out dozens of lambda instances. Because the database RPC fails (or is intentionally saturated via connection exhaustion), every parallel lambda instance evaluates `allowed: true`. The authentication request proceeds directly to Supabase Auth `signInWithPassword()`.
4. **Violation of Architecture**: The system fails open instead of failing closed. In secure multi-tenant SaaS architecture, security infrastructure failures must never silently permit unthrottled authentication attempts.

#### Remediation Recommendation
Remove the in-memory fallback entirely. Implement strict fail-closed behavior:
- If the PostgreSQL rate limiting RPC fails or cannot be reached, `checkRateLimit` must reject the request by returning `{ allowed: false, remainingAttempts: 0, retryAfterSeconds: 60 }` or throwing an operational error that halts the login action with a generic temporary service unavailable message: `"Authentication service temporarily unavailable. Please try again later."`
- Never allow an authentication attempt to proceed to `supabase.auth.signInWithPassword()` when rate-limiting verification fails.

---

### Finding SEC-3B2B1-HIGH-02: Missing Key Concurrency Race in Migration 00016

- **Severity**: **HIGH**
- **Affected File**: `supabase/migrations/00016_auth_rate_limiting.sql`
- **Line References**: Lines 116–128

#### Vulnerability Description
In stored procedure `public.record_failed_rate_limit_attempt`, the routine attempts to acquire a row lock via `SELECT ... FOR UPDATE` before inserting or updating:

```sql
-- supabase/migrations/00016_auth_rate_limiting.sql:116-128
  -- Atomic row lock
  SELECT * INTO v_record
  FROM public.auth_rate_limits
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  -- First failed attempt
  IF NOT FOUND THEN
    INSERT INTO public.auth_rate_limits (key_hash, attempts, window_start, locked_until, updated_at)
    VALUES (p_key_hash, 1, v_now, NULL, v_now);
    RETURN QUERY SELECT TRUE, 1, 0;
    RETURN;
  END IF;
```

Under PostgreSQL default `READ COMMITTED` transaction isolation:
1. `SELECT ... FOR UPDATE` on a row that does not exist acquires **no row lock**.
2. When two concurrent failed login attempts for the same uninitialized key arrive simultaneously (a standard pattern during automated brute-force attacks):
   - **Transaction A** executes `SELECT ... FOR UPDATE`, finds no row (`NOT FOUND`), and enters the `IF` block.
   - **Transaction B** executes `SELECT ... FOR UPDATE` at the same time, finds no row (`NOT FOUND`), and enters the `IF` block.
   - **Transaction A** executes `INSERT INTO public.auth_rate_limits ...` and commits successfully.
   - **Transaction B** attempts `INSERT INTO public.auth_rate_limits ...` with the identical `key_hash`.
   - **Result**: Transaction B crashes with a fatal PostgreSQL error:
     `ERROR: duplicate key value violates unique constraint "auth_rate_limits_pkey"`.
3. In `lib/auth/rate-limit.ts`, this uncaught database exception causes the RPC call to reject, which in turn engages the fail-open fallback described in SEC-3B2B1-HIGH-01.

#### Remediation Recommendation
Replace the `SELECT ... FOR UPDATE` followed by naive `INSERT` pattern with an atomic `INSERT ... ON CONFLICT` statement:

```sql
CREATE OR REPLACE FUNCTION public.record_failed_rate_limit_attempt(
  p_key_hash TEXT,
  p_max_attempts INT DEFAULT 5,
  p_window_seconds INT DEFAULT 60,
  p_lockout_seconds INT DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  attempts INT,
  retry_after_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_record public.auth_rate_limits%ROWTYPE;
  v_locked_until TIMESTAMPTZ := NULL;
  v_retry_after INT := 0;
BEGIN
  -- Probabilistic cleanup (5% of executions)
  IF random() < 0.05 THEN
    DELETE FROM public.auth_rate_limits
    WHERE updated_at < v_now - INTERVAL '2 hours';
  END IF;

  -- Atomic Upsert with row-locking concurrency handling
  INSERT INTO public.auth_rate_limits (key_hash, attempts, window_start, locked_until, updated_at)
  VALUES (p_key_hash, 1, v_now, NULL, v_now)
  ON CONFLICT (key_hash) DO UPDATE
  SET attempts = CASE
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.attempts
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN 1
        ELSE public.auth_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.window_start
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN v_now
        ELSE public.auth_rate_limits.window_start
      END,
      locked_until = CASE
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.locked_until
        WHEN v_now - public.auth_rate_limits.window_start <= (p_window_seconds || ' seconds')::INTERVAL
             AND (public.auth_rate_limits.attempts + 1) >= p_max_attempts
          THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL
        ELSE NULL
      END,
      updated_at = v_now
  RETURNING * INTO v_record;

  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_record.locked_until - v_now)))::INT;
    RETURN QUERY SELECT FALSE, v_record.attempts, v_retry_after;
  ELSE
    RETURN QUERY SELECT TRUE, v_record.attempts, 0;
  END IF;
END;
$$;
```

---

### Finding SEC-3B2B1-MED-01: Compound Keying Enables Password Spraying Attacks

- **Severity**: **MEDIUM**
- **Affected File**: `actions/auth.ts`
- **Line References**: Lines 74–77

#### Vulnerability Description
In `actions/auth.ts`, the rate limit key is constructed as a compound string:

```typescript
// actions/auth.ts:74-77
const clientIp = await getTrustedClientIp();
const rateLimitKey = clientIp
  ? `ip_user:${clientIp}:${cleanWorkspace ? cleanWorkspace + ":" : ""}${cleanUsername}`
  : `acct_fallback:${cleanWorkspace ? cleanWorkspace + ":" : ""}${cleanUsername}`;
```

This single compound key leads to two distinct security blind spots:
1. **Password Spraying (Single IP -> Many Accounts)**:
   - An attacker targeting Edvora from a single IP address can attempt 5 passwords against `kasun`, 5 passwords against `nimal`, 5 passwords against `kamal`, ..., and 5 passwords against every student and instructor in the institution.
   - Because `${cleanUsername}` is part of the key, every target user generates a distinct key hash (`key_hash`).
   - The attacking IP address is **never rate-limited globally**, allowing an attacker to spray thousands of accounts from a single IP.
2. **Distributed Account Brute-Force (Many IPs -> Single Account)**:
   - When an attacker distributes an attack against a specific high-value target (e.g. an instructor or academy owner) across a pool of 200 botnet or proxy IP addresses, each distinct `clientIp` receives its own independent bucket of 5 attempts.
   - The target account is subjected to 1,000 brute-force attempts without triggering lockout, because `acct_fallback` is bypassed whenever `clientIp` is detected.

#### Remediation Recommendation
Implement two-tier rate limiting:
1. **IP-Level Bucket**: `ip:${clientIp}` (e.g., max 30 attempts per 60 seconds across all accounts from that IP).
2. **Account-Level Bucket**: `acct:${cleanWorkspace}:${cleanUsername}` (e.g., max 5 attempts per 60 seconds across all IPs targeting that account).
Both buckets should be checked prior to password verification, and both buckets should record failed attempts.

---

### Finding SEC-3B2B1-LOW-01: Reverse Proxy Trust Assumptions and IP Header Spoofing

- **Severity**: **LOW**
- **Affected File**: `lib/auth/rate-limit.ts`
- **Line References**: Lines 50–76

#### Vulnerability Description
`extractTrustedClientIp` evaluates headers in the following order:
1. `x-vercel-ip`
2. `x-real-ip`
3. `x-forwarded-for` (rightmost entry)

#### Threat & Hosting Analysis
- **Hosting Assumptions**: On standard Vercel deployments, `x-vercel-ip` is injected at Vercel's edge and incoming client-supplied `x-vercel-ip` headers are stripped/overwritten. However, if Edvora is deployed in a custom Docker environment, self-hosted on AWS/GCP, or routed through an upstream CDN (such as Cloudflare) without explicit header stripping rules configured at the edge, a client can inject arbitrary `x-vercel-ip` values (`x-vercel-ip: 198.51.100.1`, `x-vercel-ip: 198.51.100.2`), rotating their apparent IP on every request and bypassing IP rate limiting.
- **Rightmost `x-forwarded-for` Assumption**: In proxy chains with internal load balancers or forwarders (e.g. Ingress -> Envoy -> Node), the rightmost IP can represent the internal ingress proxy rather than the external client IP.
- **Header Stripping Denial-of-Service**: If an attacker strips all IP headers or connects directly, `extractTrustedClientIp` returns `null`. The engine falls back to `acct_fallback:${workspace}:${username}`. While this prevents unthrottled attacks against that user, an attacker can intentionally lock out legitimate students by deliberately exhausting the account bucket.

#### Remediation Recommendation
Document the mandatory edge proxy configuration requirements for production deployment:
- Confirm that Vercel Edge strips untrusted incoming `x-vercel-ip` and `x-real-ip` headers from client HTTP requests.
- For non-Vercel environments, mandate an edge security policy that overwrites client headers.

---

### Finding SEC-3B2B1-INFO-01: Mock-Based Test Limitations Mask Concurrency Defects

- **Severity**: **INFORMATIONAL**
- **Affected File**: `tests/saas/student-auth-isolation.test.ts`
- **Line References**: Lines 508–520

#### Vulnerability Description
In `tests/saas/student-auth-isolation.test.ts`, `Requirement 3: Atomic rate limiting correctly handles concurrent failed attempts` was executed:

```typescript
// tests/saas/student-auth-isolation.test.ts:513-519
const results = await Promise.all([
  recordFailedAttempt(testKey, opts),
  recordFailedAttempt(testKey, opts),
  recordFailedAttempt(testKey, opts),
  recordFailedAttempt(testKey, opts),
  recordFailedAttempt(testKey, opts),
]);
```

Because Database Migration 00016 has not been applied to Supabase and the test runner executes without a live PostgreSQL instance, `recordFailedAttempt` threw an error and fell back to `emergencyStore` (an in-memory JavaScript `Map` inside a single Node.js process).

Because JavaScript executes on a single-threaded event loop, all operations against `emergencyStore` executed sequentially without true database concurrency or I/O latency. This masked the primary key violation race condition present in `00016_auth_rate_limiting.sql` (Finding SEC-3B2B1-HIGH-02).

#### Remediation Recommendation
Classify `tests/saas/student-auth-isolation.test.ts` strictly as **Mock-Based Unit Tests**. Mandatory staging validation against live Supabase PostgreSQL is required before production deployment.

---

## 3. Metadata Security Verification (Priority 2)

An exhaustive audit of all 10 dynamic route `generateMetadata` implementations in the `app/` directory was conducted:

| Route Path | Tenant Authorization Check | Scope / Filter Enforcement | Sanitized Fallback | Audit Verdict |
| :--- | :--- | :--- | :--- | :--- |
| `app/(teacher)/dashboard/batches/[batchId]/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Batch Details — Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/batches/[batchId]/edit/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Edit Batch — Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/batches/[batchId]/students/[studentId]/page.tsx` | `getTenantContext()` | Scoped via `student_identities` & `enrollments` before profile read | `"Student Details — Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/lessons/[lessonId]/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Lesson — Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/lessons/[lessonId]/edit/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Edit Lesson — Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/notes/[noteId]/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Note Details – Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/notes/[noteId]/edit/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Edit Note – Edvora"` | **SECURE** |
| `app/(teacher)/dashboard/announcements/[announcementId]/edit/page.tsx` | `getTenantContext()` | `.eq("tenant_id", tenant.tenantId)` | `"Edit Announcement — Edvora"` | **SECURE** |
| `app/(student)/home/lessons/[lessonId]/page.tsx` | `auth.getUser()` + active profile | Scoped by `studentTenantIds` and `lesson_batches` in `enrolledBatchIds` | `"Watch Lesson – Edvora"` | **SECURE** |
| `app/(student)/home/notes/[noteId]/page.tsx` | `auth.getUser()` + active profile | Scoped by `studentTenantIds` and `note_batches` in `enrolledBatchIds` | `"Read Note – Edvora"` | **SECURE** |

**Verification Outcome**:
- All 10 dynamic metadata generators perform cryptographic authentication and workspace validation.
- Unauthenticated requests receive generic fallback strings without triggering database reads or leaking titles.
- Cross-tenant requests are filtered at the database query level (`.eq("tenant_id", tenantId)`).
- Student metadata queries verify active batch enrollments before disclosing lesson or note titles.
- No dynamic metadata routes were overlooked. Static metadata exports across the rest of the application contain no user-controllable or dynamic data.
- **Finding SEC-3B2B-MED-01 is verified as remediated.**

---

## 4. Announcement Isolation Verification (Priority 3)

An audit of announcement queries and presentation logic was conducted across:
- `app/(student)/home/announcements/page.tsx`
- `app/(student)/home/page.tsx`

### Verification Details
1. **Query-Level Scoping**:
   Both pages query announcements with `.in("tenant_id", studentTenantIds)`, restricting retrieval strictly to workspaces in which the student has a verified identity or enrollment.
2. **Batch Filter View**:
   ```typescript
   // app/(student)/home/announcements/page.tsx:143
   return scopedAnnIdSet.has(a.id) || (a.is_broadcast && a.tenant_id === selectedBatchTenantId);
   ```
   When a student filters by a specific batch, broadcast announcements are strictly restricted to the workspace owning that batch (`a.tenant_id === selectedBatchTenantId`). Broadcasts from other workspaces where the student has identities cannot leak into the batch view.
3. **All Batches View**:
   ```typescript
   // app/(student)/home/announcements/page.tsx:147
   return (a.is_broadcast && enrolledTenantIds.has(a.tenant_id)) || scopedAnnIdSet.has(a.id);
   ```
   When viewing all notices, broadcast announcements are restricted to workspaces where the student has **active batch enrollments** (`enrolledTenantIds`). Workspaces with zero enrollments are filtered out.
4. **Student Home Feed**:
   `app/(student)/home/page.tsx` line 121 enforces identical scoping (`(a.is_broadcast && enrolledTenantIds.has(a.tenant_id)) || scopedAnnIds.includes(a.id)`).
- **Finding SEC-3B2B-LOW-01 is verified as remediated.**

---

## 5. Test Quality & Verification Classification

### Test Execution Summary
Command executed: `npm run test:saas`
- Total Tests: 43
- Passed: 43 (100%)
- Failed: 0

### Test Classification Breakdown
1. **Mock-Based Unit Tests**:
   - `tests/saas/auth-foundation.test.ts`: Unit tests verifying role permission tables, hierarchy helpers, and cookie hint parsers.
   - `tests/saas/actions-security.test.ts`: Unit tests simulating staff server action security barriers using mock Supabase clients.
   - `tests/saas/student-auth-isolation.test.ts` (Scenarios 1–6, 10–14): Unit tests verifying login schema validation, anti-enumeration error consistency, inactive user redirection, and legacy email patterns.
2. **Query-Contract Tests**:
   - `Requirement 1` & `Requirement 2` in `student-auth-isolation.test.ts`: Verify the logical contract of metadata query filtering algorithms.
   - `Requirement 9`: Verifies the set-intersection filtering logic of multi-workspace announcement isolation.
3. **PostgreSQL Integration Tests**: **0 executed** (Migrations 00007–00016 remain unapplied per strict execution restrictions).
4. **PostgreSQL Concurrent Row-Locking Tests**: **0 executed** (`Requirement 3` ran against in-memory JavaScript `Map` fallback due to missing live database connection).

### Remaining Staging Supabase Validation Requirements
Before production deployment, the following tests MUST be executed against a live Supabase staging instance with Migration 00016 applied:
1. **PostgreSQL Concurrency Test**: Execute 50 concurrent requests against a previously uninitialized rate-limit key to verify that row initialization does not throw unique constraint violations.
2. **Row Lock Verification**: Verify that `SELECT ... FOR UPDATE` serializes concurrent increments under heavy load without lost updates.
3. **Security Grants Audit**: Verify from `psql` that `anon` and `authenticated` roles receive `permission denied` on `public.auth_rate_limits` table and RPC routines.
4. **Fail-Closed Verification**: Simulate a database network partition and verify that authentication attempts fail closed with an error rather than bypassing rate limiting.

---

## 6. Required Corrections Checklist

Before Phase 3B2-C can be approved, the following corrections must be implemented:

- [ ] **CORRECTION 1**: Remove the fail-open in-memory emergency fallback from `lib/auth/rate-limit.ts`. If the database RPC fails, return `{ allowed: false }` or throw an operational error that blocks authentication (fail-closed).
- [ ] **CORRECTION 2**: Rewrite `record_failed_rate_limit_attempt` in `supabase/migrations/00016_auth_rate_limiting.sql` using `INSERT ... ON CONFLICT (key_hash) DO UPDATE ...` to eliminate the concurrency race condition on uninitialized keys.
- [ ] **CORRECTION 3**: Implement two-tier rate limiting in `actions/auth.ts` to defend against password spraying (track `ip:${clientIp}` separately from `acct:${cleanWorkspace}:${cleanUsername}`).

---

## 7. Final Verdict

**CORRECTIONS REQUIRED**

- **Metadata Information Disclosure**: APPROVED & CLOSED.
- **Announcement Cross-Tenant Bleed**: APPROVED & CLOSED.
- **Rate Limiting Architecture**: CORRECTIONS REQUIRED (Fail-open fallback, concurrent initialization race, and compound keying password spraying).
