# EDVORA — PHASE 3B2-B.2: DISTRIBUTED RATE LIMITER SECURITY HARDENING IMPLEMENTATION REPORT

**Document ID**: `EDV-SaaS-3B2B2-REP-001`  
**Phase**: Phase 3B2-B.2 (Rate Limiter Security Hardening)  
**Date**: November 24, 2026  
**Status**: COMPLETE  
**Verdict**: **APPROVED FOR INDEPENDENT RE-REVIEW**  
**Classification**: Internal Technical Architecture & Application Security Report  

---

## 1. Executive Summary

Phase 3B2-B.1 underwent independent application security review in `docs/saas/PHASE_3B2B1_INDEPENDENT_SECURITY_REVIEW.md`, which approved metadata defense-in-depth and announcement isolation, but issued a verdict of **CORRECTIONS REQUIRED** due to three rate-limiting architecture vulnerabilities:

1. **Fail-Open In-Memory Fallback (SEC-3B2B1-HIGH-01)**: `lib/auth/rate-limit.ts` caught database RPC errors and engaged an in-memory `Map` fallback, allowing unthrottled brute-force attempts on fresh serverless lambda instances during database connectivity interruptions or connection pool exhaustion.
2. **Missing Key Concurrency Race in Migration 00016 (SEC-3B2B1-HIGH-02)**: Stored procedure `record_failed_rate_limit_attempt` used `SELECT ... FOR UPDATE` followed by `INSERT` on uninitialized keys. In PostgreSQL `READ COMMITTED` mode, non-existent rows acquire no row lock, causing concurrent initial requests to crash with primary key unique constraint violations (`auth_rate_limits_pkey`).
3. **Compound Keying Structure Permitted Password Spraying (SEC-3B2B1-MED-01)**: Rate limit keys bound `(IP + Workspace + Username)` together. An attacker could spray thousands of accounts from a single IP address without triggering rate limiting, as each username generated an isolated key hash.

This Phase 3B2-B.2 implementation successfully remediates all three vulnerabilities:
- **Strict Fail-Closed Rate Limiting**: Completely purged all in-memory fallbacks from `lib/auth/rate-limit.ts`. Any database failure halts authentication and returns a safe, controlled temporary unavailability response without proceeding to password verification.
- **PostgreSQL Atomic Upsert (`INSERT ... ON CONFLICT DO UPDATE`)**: Rewrote `record_failed_rate_limit_attempt` in prepared Migration `00016_auth_rate_limiting.sql` using an atomic `ON CONFLICT (key_hash) DO UPDATE` query contract, eliminating the primary key violation race condition.
- **Two-Tier Independent Rate Limiting**: Implemented separate, decoupled rate-limiting buckets in `actions/auth.ts`: an Account bucket (`acct:<workspace>:<username>` / `acct:teacher:<email>`) with a strict threshold (5 attempts / 60s), and an IP bucket (`ip:<client-ip>`) with an operational threshold (30 attempts / 60s). Successful login resets only the account bucket, preserving network-level protection against password spraying.

All 42 automated tests pass cleanly (`npm run test:saas`), TypeScript type checks passed with 0 errors (`npx tsc --noEmit`), ESLint passed with 0 warnings or errors (`npm run lint`), and the full production Next.js 16 build succeeded with 31/31 routes compiled and prerendered.

---

## 2. Modified Files Manifest

| File Path | Description of Changes |
| :--- | :--- |
| `lib/auth/rate-limit.ts` | Purged `emergencyStore`, `runEmergencyCheck`, and `runEmergencyRecordFailed`. Refactored `checkRateLimit` and `recordFailedAttempt` to strictly fail closed, logging sanitized key hashes and returning `{ allowed: false, error: "RATE_LIMIT_SERVICE_UNAVAILABLE" }`. |
| `supabase/migrations/00016_auth_rate_limiting.sql` | Prepared migration rewrite: Replaced `SELECT ... FOR UPDATE` + `INSERT` with atomic `INSERT ... ON CONFLICT (key_hash) DO UPDATE` in `record_failed_rate_limit_attempt`. Retained `SET search_path = ''` and service-role execution grants. Added concurrency documentation for `reset_rate_limit`. |
| `actions/auth.ts` | Implemented two-tier rate limiting: `accountKey` (`acct:${workspace}:${username}` / `acct:teacher:${email}`) and `ipKey` (`ip:${clientIp}`). Evaluated both before password verification. Incremented both on failure. Reset only `accountKey` on success. Handled service unavailability errors gracefully. |
| `tests/saas/student-auth-isolation.test.ts` | Updated and expanded test suite: Added tests for fail-closed behavior on database error, absence of in-memory fallback, atomic ON CONFLICT query contracts, two-tier account vs. IP spraying blocking, selective bucket resets, missing IP handling, and sanitized error logging. |

---

## 3. Rate-Limiting Architecture & Security Design

### 3.1 Two-Tier Rate Limiting Model

Authentication endpoints now enforce two independent, decoupled rate-limiting tiers before any call to Supabase Auth (`signInWithPassword`):

```
                                    [Incoming Login Request]
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                         [Account-Tier Key]          [IP-Tier Key]
                     acct:<workspace>:<user>         ip:<client-ip>
                                    │                       │
                                    ▼                       ▼
                         [Check Rate Limit]          [Check Rate Limit]
                          Max: 5 per 60s              Max: 30 per 60s
                                    │                       │
                       Pass? ───────┴───────────────┬───────┘
                        │                           │
                       YES                          NO (or DB Error)
                        │                           │
                        ▼                           ▼
            [Password Verification]             [FAIL CLOSED]
          signInWithPassword(...)         Return generic error immediately
```

#### Tier 1: Account-Tier Rate Limiter
- **Key Formats**:
  - Student: `acct:${cleanWorkspace || "default"}:${cleanUsername}`
  - Teacher: `acct:teacher:${cleanUsername}`
- **Threshold**: 5 failed attempts within a 60-second sliding window.
- **Lockout Duration**: 60 seconds.
- **Purpose**: Prevents credential brute-forcing against a specific student or teacher account, regardless of how many different IP addresses the attacker utilizes (defeats distributed proxy/botnet attacks against a single user).
- **Reset Behavior**: Automatically reset upon successful authentication for that specific account.

#### Tier 2: IP-Tier Rate Limiter
- **Key Format**: `ip:${clientIp}` (when a trusted client IP is resolvable).
- **Threshold**: 30 failed attempts within a 60-second sliding window.
- **Lockout Duration**: 60 seconds.
- **Purpose**: Prevents horizontal password spraying where an attacker attempts common passwords across many accounts from a single IP address. The generous threshold (30 attempts/min) accommodates legitimate scenarios where multiple students share a school or tuition center NAT IP.
- **Reset Behavior**: **DELIBERATELY PRESERVED ON SUCCESS**. The IP bucket is NOT reset when an account successfully logs in. Resetting the IP bucket on a single successful login would permit an attacker who successfully compromised one account to reset their network-level quota and resume spraying other accounts.

---

### 3.2 Strict Fail-Closed Error Handling

In accordance with strict security standards, in-memory emergency fallbacks have been eliminated:

```typescript
// lib/auth/rate-limit.ts
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitStatus> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const keyHash = hashRateLimitKey(key);

  try {
    const adminClient = options.supabaseClient ?? createServerAdminClient();
    // Database RPC invocation ...
    return {
      allowed: Boolean(result.allowed),
      remainingAttempts: Number(result.remaining_attempts ?? 0),
      retryAfterSeconds: Number(result.retry_after_seconds ?? 0) || undefined,
    };
  } catch (err: unknown) {
    // Log sanitized key hash without sensitive credentials or raw IP addresses
    console.error(
      `[RATE_LIMIT_FAIL_CLOSED] check_rate_limit service error for key_hash=${keyHash}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    // STRICT FAIL-CLOSED: Deny authentication when verification cannot be completed
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: 60,
      error: "RATE_LIMIT_SERVICE_UNAVAILABLE",
    };
  }
}
```

#### Caller Enforcement in `actions/auth.ts`:
If either `accountStatus.allowed` or `ipStatus.allowed` is `false`:
- If `error === "RATE_LIMIT_SERVICE_UNAVAILABLE"`, returns `{ success: false, error: "Authentication service temporarily unavailable. Please try again later." }`.
- If locked out due to exceeded attempts, returns `{ success: false, error: "Too many login attempts on this account. Please wait ${waitTime} seconds before trying again." }` or network-level equivalent.
- **Execution halts immediately**. The action never invokes `supabase.auth.signInWithPassword()` when rate-limiting verification fails.

---

### 3.3 PostgreSQL Atomic Upsert Strategy (`00016_auth_rate_limiting.sql`)

To solve the concurrency race condition where `SELECT ... FOR UPDATE` acquires no row lock on non-existent keys (SEC-3B2B1-HIGH-02), `record_failed_rate_limit_attempt` was rewritten using PostgreSQL's atomic `INSERT ... ON CONFLICT DO UPDATE`:

```sql
  -- Atomic Upsert with row-locking concurrency handling:
  -- Guarantees atomic insertion if key does not exist, or atomic row update if it does.
  INSERT INTO public.auth_rate_limits (
    key_hash,
    attempts,
    window_start,
    locked_until,
    updated_at
  )
  VALUES (
    p_key_hash,
    1,
    v_now,
    CASE WHEN 1 >= p_max_attempts THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL ELSE NULL END,
    v_now
  )
  ON CONFLICT (key_hash) DO UPDATE
  SET attempts = CASE
        -- If currently locked out, maintain attempt counter or increment
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.attempts + 1
        -- If window expired, reset counter to 1
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN 1
        -- Within active window: increment attempts
        ELSE public.auth_rate_limits.attempts + 1
      END,
      window_start = CASE
        -- If currently locked out, maintain active window start
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.window_start
        -- If window expired, start new window
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN v_now
        -- Otherwise maintain existing window start
        ELSE public.auth_rate_limits.window_start
      END,
      locked_until = CASE
        -- If already locked out, preserve existing lockout expiration
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.locked_until
        -- If window expired, new attempt has not reached threshold (unless p_max_attempts <= 1)
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN CASE WHEN 1 >= p_max_attempts THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL ELSE NULL END
        -- If increment pushes attempts to or past max_attempts, set lockout
        WHEN (public.auth_rate_limits.attempts + 1) >= p_max_attempts
          THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL
        ELSE NULL
      END,
      updated_at = v_now
  RETURNING * INTO v_record;
```

#### Atomicity Guarantees:
- **No Unhandled Exceptions**: If two concurrent transactions attempt to insert the same `key_hash` simultaneously, PostgreSQL's unique index locks serialize the operations. The first transaction inserts; the second transaction automatically detects the conflict and executes the `DO UPDATE` branch on the committed row. No `unique_violation` error is thrown.
- **Window Expiry Preservation**: If the sliding window has elapsed (`v_now - window_start > window_seconds`), the update resets `attempts = 1` and `window_start = v_now`, seamlessly recycling expired records without requiring pre-deletion.
- **Reset Concurrency**: If a successful login executes `reset_rate_limit` (`DELETE FROM public.auth_rate_limits`) concurrently with a failed attempt, PostgreSQL's statement-level row locking serializes the operations. The system remains strictly consistent without deadlocks.
- **Privilege Hardening**: Permissions on `public.auth_rate_limits` and all three RPC functions are revoked from `PUBLIC`, `anon`, and `authenticated`. Execution is granted strictly to `service_role`. All functions enforce `SET search_path = ''`.

---

### 3.4 Trusted IP Edge Assumptions & Missing IP Resilience

#### Trust Model Assumptions:
- **Vercel Deployments**: On Vercel Edge, `x-vercel-ip` is injected directly by the edge proxy based on the client TCP socket. External incoming client headers named `x-vercel-ip` are stripped at the Vercel edge boundary. It is the primary trusted IP source.
- **Proxy Chains**: For reverse proxies providing `x-forwarded-for`, `extractTrustedClientIp()` evaluates the **rightmost** valid IPv4/IPv6 address (`parts[parts.length - 1]`), protecting against client-injected leftmost spoofed IPs.
- **Missing or Untrusted IP Handling**: If no valid IP header exists (e.g. client strips headers, direct connections without edge reverse proxy), `extractTrustedClientIp()` returns `null`.
  - When `clientIp === null`, `ipKey === null`. The engine bypasses the IP bucket check and relies **strictly on the account bucket** (`acct:${workspace}:${username}`).
  - Because `accountKey` does not incorporate the IP address, **an attacker cannot bypass account rate limiting by rotating or stripping IP headers**. 5 failed attempts against that account will lock it out regardless of IP presence.

---

## 4. Test Quality & Verification Classification

### 4.1 Automated Tests Executed (`npm run test:saas`)
Command executed: `npm run test:saas`  
Output: **42 passed, 0 failed, 0 errors**.

```
▶ Phase 3B2-A: Server Actions Multi-Tenant Security & Isolation
  ✔ Scenario 1: Rejects unauthenticated requests before any action can execute (3.0681ms)
  ✔ Scenario 2: An instructor in Tenant A cannot acquire or operate on Tenant B context (2.273ms)
  ✔ Scenario 3: An owner accessing their authorized tenant succeeds with full permissions (767.3991ms)
  ✔ Scenario 4: An admin attempting owner-only operations (workspace deletion, billing) is rejected (6.0773ms)
  ✔ Scenario 5: An instructor attempting to delete a batch (batches:delete) is rejected (2.4072ms)
  ✔ Scenario 6: An assistant attempting curriculum operations is rejected (3.1062ms)
  ✔ Scenario 7: Forged tenant IDs supplied in request hints are rejected against server records (0.3034ms)
  ✔ Scenario 8: Cross-tenant operations are strictly scoped by tenant_id in queries (1.5099ms)
  ✔ Scenario 9: Unprivileged callers cannot execute student provisioning or admin deletion (2.4367ms)
  ✔ Scenario 10: Students are prevented from executing staff actions and have isolated capabilities (0.6497ms)
  ✔ assertTeacher backward compatibility: verified function signature and deprecation (0.1288ms)
✔ Phase 3B2-A: Server Actions Multi-Tenant Security & Isolation (791.7187ms)

▶ Phase 3B1: Multi-Tenant Authentication & Authorization Foundation
  ✔ Scenario 1: Rejects unauthenticated user requests (2.3141ms)
  ✔ Scenario 2: Automatically resolves single active workspace without cookie (1.0539ms)
  ✔ Scenario 3: Mandates workspace selection when user has multiple workspaces without selection (0.5043ms)
  ✔ Scenario 4: Resolves requested workspace when matching valid cookie hint is provided (0.4582ms)
  ✔ Scenario 5: Safely ignores malformed or non-UUID cookie values (0.3468ms)
  ✔ Scenario 6: Rejects cookie pointing to a tenant the user is NOT a member of (0.7481ms)
  ✔ Scenario 7: Rejects user whose profile is deactivated (is_active = false) (0.5802ms)
  ✔ Scenario 8: Rejects access when the tenant is deactivated (tenants.is_active = false) (0.5108ms)
  ✔ Scenario 9: Owner role possesses full administrative and governance capabilities (0.4705ms)
  ✔ Scenario 10: Admin role possesses operational rights but lacks workspace deletion and billing mutation (0.8059ms)
  ✔ Scenario 11: Instructor role manages curriculum but cannot delete batches, enroll students, or manage billing (0.1715ms)
  ✔ Scenario 12: Assistant role possesses restricted support rights and cannot delete content or manage batches (0.1202ms)
  ✔ Scenario 13: Rejects unknown roles by default (1.4843ms)
  ✔ Scenario 14: Rejects unknown permissions by default (0.3034ms)
✔ Phase 3B1: Multi-Tenant Authentication & Authorization Foundation (11.9693ms)

▶ Phase 3B2-B.2: Distributed Rate Limiter Security Hardening
  ✔ Test 1: Database rate-limit failure blocks login (Fail-Closed) (4.3914ms)
  ✔ Test 2: No in-memory fallback exists when database is unavailable (0.8788ms)
  ✔ Test 13: RPC errors never expose sensitive details to users or in key hash logs (0.4689ms)
  ✔ Test 3: Query contract for atomic initialization (INSERT ... ON CONFLICT DO UPDATE) (0.8286ms)
  ✔ Test 4: Concurrent increments do not lose attempts (0.4276ms)
  ✔ Test 5: Expired window resets attempts correctly (1110.7776ms)
  ✔ Test 6: Account bucket blocks repeated brute-force attempts against a single account (3.2143ms)
  ✔ Test 7: IP bucket blocks horizontal password spraying across multiple accounts (2.0177ms)
  ✔ Test 8: Same username in different workspaces remains isolated (0.6407ms)
  ✔ Test 9: Successful login resets ONLY the account bucket, preserving IP bucket (0.4854ms)
  ✔ Test 10: Missing or untrusted IP does not bypass account protection (0.3245ms)
  ✔ Test 11: Teacher login uses rate limiting (0.3283ms)
  ✔ Test 12: Student login uses rate limiting (0.1233ms)
  ✔ Test: Trusted IP extraction logic handles edge proxy hierarchies (0.2818ms)
  ✔ Regression: Multi-workspace announcement filtering prevents cross-tenant broadcast bleed (0.223ms)
  ✔ Regression: Legacy student login without workspace code resolves default-workspace (0.1624ms)
  ✔ Regression: Student attempting staff requireTenantContext() is rejected with NO_WORKSPACES (1.6482ms)
✔ Phase 3B2-B.2: Distributed Rate Limiter Security Hardening (1130.3873ms)

ℹ tests 42
ℹ suites 3
ℹ pass 42
ℹ fail 0
```

### 4.2 Explicit Classification of Tests
In accordance with auditor instructions, we explicitly classify the tests executed:
1. **Mock-Based Unit Tests & Query-Contract Tests (EXECUTED)**:
   - All tests in `tests/saas/student-auth-isolation.test.ts` ran in Node.js using mock Supabase clients.
   - Test 1 & Test 2 proved that when the database client throws or errors, the rate limiter strictly fails closed and does not engage any in-memory store.
   - Test 3 & Test 4 verified the state-machine query contract of the `INSERT ... ON CONFLICT DO UPDATE` algorithm.
   - Test 6 & Test 7 verified the two-tier decoupling between account lockout and IP-level password spraying defense.
2. **PostgreSQL Concurrent Integration Tests (NOT EXECUTED / UNAPPLIED MIGRATION)**:
   - Because Database Migration 00016 remains unapplied per strict Phase 3 rules (no live migrations applied to Supabase), **actual multi-process PostgreSQL row locking and index serialization tests were NOT executed against a live database**.
   - Mock unit tests CANNOT prove real PostgreSQL transaction isolation or row-level deadlock freedom under high database network load.

---

## 5. Remaining Staging Requirements

Prior to production release, the following tests MUST be performed on a live Supabase staging database:

1. **Live Migration 00016 Execution**: Apply `00016_auth_rate_limiting.sql` using Supabase CLI / migration runner.
2. **Real PostgreSQL Concurrency Test**: Run a multi-threaded benchmark (e.g. 100 concurrent workers via k6 or Node cluster) against an uninitialized `key_hash` to prove that PostgreSQL's primary key index serializes concurrent `INSERT ... ON CONFLICT` statements without throwing unique constraint violations.
3. **Database Outage Simulation**: Terminate or pause the staging PostgreSQL connection pool and verify that Next.js Server Actions return `"Authentication service temporarily unavailable. Please try again later."` without unhandled crashes or fail-open leaks.
4. **Vercel Edge Header Audit**: In a preview deployment, inspect incoming headers store to confirm that external client headers named `x-vercel-ip` cannot be spoofed from outside the network.

---

## 6. Strict Compliance Checklist

| Constraint / Rule | Compliance Status | Details |
| :--- | :--- | :--- |
| **No SQL applied to Supabase** | **COMPLIANT** | Migration `00016` remains unapplied; zero SQL executed against remote database. |
| **No deploy or push** | **COMPLIANT** | Local workspace only; no commits or pushes to remotes. |
| **No Phase 3B2-C commencement** | **COMPLIANT** | Phase 3B2-C has not started. |
| **Preserve existing accounts & passwords** | **COMPLIANT** | No password resets or account recreations. |
| **No paid third-party services** | **COMPLIANT** | Zero external APIs or paid rate limiters added; native PostgreSQL RPC only. |
| **No in-memory fallback** | **COMPLIANT** | Completely removed all in-memory fallback stores and logic. |
| **Fail-closed enforcement** | **COMPLIANT** | Database RPC failures deny login and return controlled generic error. |

---

## 7. Final Verdict

**APPROVED FOR INDEPENDENT RE-REVIEW**

All three findings from `PHASE_3B2B1_INDEPENDENT_SECURITY_REVIEW.md` (fail-open fallback, concurrent insertion race, and compound keying password spraying) have been remediated, verified via automated test suite execution, TypeScript typechecking, ESLint validation, and Next.js 16 production build. The implementation is ready for independent security re-audit.
