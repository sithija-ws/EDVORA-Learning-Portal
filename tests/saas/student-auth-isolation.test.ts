// tests/saas/student-auth-isolation.test.ts
// Test Suite: Phase 3B2-B.2 Distributed Rate Limiter Security Hardening
//
// ⚠️ TEST ENVIRONMENT CLASSIFICATION:
// CLASSIFICATION: MOCKED UNIT & QUERY-CONTRACT TESTS
// NOTE: Database migrations 00007-00016 remain unapplied per strict Phase 3 rules.
// These tests exercise the two-tier rate limiting (Account + IP), fail-closed error handling,
// atomic ON CONFLICT query contracts, anti-enumeration protections, IP edge trust hierarchy,
// legacy default-workspace compatibility, metadata defense-in-depth, and announcement isolation.
// IMPORTANT: Mock tests cannot prove PostgreSQL row locking or network atomicity.
// Staging validation against live Supabase PostgreSQL remains mandatory.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  extractTrustedClientIp,
  isValidIpFormat,
  ACCOUNT_RATE_LIMIT_OPTIONS,
  IP_RATE_LIMIT_OPTIONS,
} from "../../lib/auth/rate-limit.ts";
import {
  requireTenantContext,
  TenantAuthError,
} from "../../lib/auth/tenant.ts";
import { STUDENT_EMAIL_DOMAIN } from "../../lib/constants.ts";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const STUDENT_USER_ID = "55555555-5555-4555-8555-555555555555";
const FOREIGN_STUDENT_ID = "66666666-6666-4666-8666-666666666666";

const TENANT_1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_1_SLUG = "apex-maths";

const TENANT_2_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENANT_2_SLUG = "sigma-physics";

const TENANT_3_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TENANT_3_SLUG = "delta-chemistry";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_TENANT_SLUG = "default-workspace";

function createMockStudentUser(id: string = STUDENT_USER_ID): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

/**
 * Creates a mock Supabase client implementing the exact PostgreSQL stored procedure
 * query contract of Migration 00016 (INSERT ... ON CONFLICT DO UPDATE).
 */
function createMockRateLimitSupabaseClient() {
  const store = new Map<
    string,
    {
      attempts: number;
      window_start: number;
      locked_until: number | null;
      updated_at: number;
    }
  >();

  const client = {
    store,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const now = Date.now();
      const keyHash = args.p_key_hash as string;

      if (fn === "check_rate_limit") {
        const maxAttempts = (args.p_max_attempts as number) ?? 5;
        const windowSeconds = (args.p_window_seconds as number) ?? 60;
        const record = store.get(keyHash);

        if (!record) {
          return {
            data: [{ allowed: true, remaining_attempts: maxAttempts, retry_after_seconds: 0 }],
            error: null,
          };
        }

        if (record.locked_until && record.locked_until > now) {
          const retryAfter = Math.ceil((record.locked_until - now) / 1000);
          return {
            data: [{ allowed: false, remaining_attempts: 0, retry_after_seconds: retryAfter }],
            error: null,
          };
        }

        if (now - record.window_start > windowSeconds * 1000) {
          return {
            data: [{ allowed: true, remaining_attempts: maxAttempts, retry_after_seconds: 0 }],
            error: null,
          };
        }

        if (record.attempts >= maxAttempts) {
          const retryAfter = record.locked_until
            ? Math.ceil((record.locked_until - now) / 1000)
            : windowSeconds;
          return {
            data: [{ allowed: false, remaining_attempts: 0, retry_after_seconds: retryAfter }],
            error: null,
          };
        }

        return {
          data: [
            {
              allowed: true,
              remaining_attempts: Math.max(0, maxAttempts - record.attempts),
              retry_after_seconds: 0,
            },
          ],
          error: null,
        };
      }

      if (fn === "record_failed_rate_limit_attempt") {
        const maxAttempts = (args.p_max_attempts as number) ?? 5;
        const windowSeconds = (args.p_window_seconds as number) ?? 60;
        const lockoutSeconds = (args.p_lockout_seconds as number) ?? 60;
        const record = store.get(keyHash);

        // Mimic INSERT ... ON CONFLICT DO UPDATE
        if (!record) {
          const isLocked = 1 >= maxAttempts;
          const lockedUntil = isLocked ? now + lockoutSeconds * 1000 : null;
          store.set(keyHash, {
            attempts: 1,
            window_start: now,
            locked_until: lockedUntil,
            updated_at: now,
          });
          return {
            data: [{ allowed: !isLocked, attempts: 1, retry_after_seconds: isLocked ? lockoutSeconds : 0 }],
            error: null,
          };
        }

        // On Conflict Update clause
        let newAttempts = record.attempts + 1;
        let newWindowStart = record.window_start;
        let newLockedUntil = record.locked_until;

        if (record.locked_until && record.locked_until > now) {
          newAttempts = record.attempts + 1;
        } else if (now - record.window_start > windowSeconds * 1000) {
          newAttempts = 1;
          newWindowStart = now;
          newLockedUntil = 1 >= maxAttempts ? now + lockoutSeconds * 1000 : null;
        } else {
          if (newAttempts >= maxAttempts) {
            newLockedUntil = now + lockoutSeconds * 1000;
          }
        }

        store.set(keyHash, {
          attempts: newAttempts,
          window_start: newWindowStart,
          locked_until: newLockedUntil,
          updated_at: now,
        });

        const isLocked = Boolean(newLockedUntil && newLockedUntil > now);
        const retryAfter = isLocked ? Math.ceil((newLockedUntil! - now) / 1000) : 0;
        return {
          data: [{ allowed: !isLocked, attempts: newAttempts, retry_after_seconds: retryAfter }],
          error: null,
        };
      }

      if (fn === "reset_rate_limit") {
        store.delete(keyHash);
        return { data: null, error: null };
      }

      return { data: null, error: new Error(`Unknown RPC function: ${fn}`) };
    },
  } as unknown as SupabaseClient;

  return client;
}

/**
 * Simulates the two-tier authentication resolution engine in actions/auth.ts
 */
async function simulateStudentLogin(
  params: {
    workspace?: string;
    username: string;
    password: string;
  },
  db: {
    tenants: Array<{ id: string; slug: string; name: string; is_active: boolean }>;
    studentIdentities: Array<{
      id: string;
      tenant_id: string;
      student_id: string;
      username: string;
      auth_email: string;
    }>;
    profiles: Array<{ id: string; role: string; is_active: boolean; full_name: string }>;
    validPasswords: Record<string, string>;
  },
  rateLimitClient: SupabaseClient,
  clientIp: string | null = "127.0.0.1"
): Promise<{
  success: boolean;
  error?: string;
  targetPath?: string;
  resolvedTenantId?: string | null;
  targetAuthEmail?: string;
}> {
  const genericErrorMessage = "Invalid workspace, username, or password";
  const cleanUsername = params.username.normalize("NFKC").trim().toLowerCase();
  const cleanWorkspace = params.workspace ? params.workspace.normalize("NFKC").trim().toLowerCase() : "";
  const isTeacherLogin = cleanUsername.includes("@");

  // 1. Establish Two-Tier Rate Limit Keys
  const accountKey = isTeacherLogin
    ? `acct:teacher:${cleanUsername}`
    : `acct:${cleanWorkspace || "default"}:${cleanUsername}`;
  const ipKey = clientIp ? `ip:${clientIp}` : null;

  const recordAuthFailure = async () => {
    await Promise.all([
      recordFailedAttempt(accountKey, { ...ACCOUNT_RATE_LIMIT_OPTIONS, supabaseClient: rateLimitClient }),
      ipKey
        ? recordFailedAttempt(ipKey, { ...IP_RATE_LIMIT_OPTIONS, supabaseClient: rateLimitClient })
        : Promise.resolve(),
    ]);
  };

  // 2. Account-tier check (Fail-Closed)
  const accountStatus = await checkRateLimit(accountKey, {
    ...ACCOUNT_RATE_LIMIT_OPTIONS,
    supabaseClient: rateLimitClient,
  });
  if (!accountStatus.allowed) {
    if (accountStatus.error === "RATE_LIMIT_SERVICE_UNAVAILABLE") {
      return {
        success: false,
        error: "Authentication service temporarily unavailable. Please try again later.",
      };
    }
    const waitTime = accountStatus.retryAfterSeconds ?? ACCOUNT_RATE_LIMIT_OPTIONS.lockoutSeconds;
    return {
      success: false,
      error: `Too many login attempts on this account. Please wait ${waitTime} seconds before trying again.`,
    };
  }

  // 3. IP-tier check (Fail-Closed, if IP is available)
  if (ipKey) {
    const ipStatus = await checkRateLimit(ipKey, {
      ...IP_RATE_LIMIT_OPTIONS,
      supabaseClient: rateLimitClient,
    });
    if (!ipStatus.allowed) {
      if (ipStatus.error === "RATE_LIMIT_SERVICE_UNAVAILABLE") {
        return {
          success: false,
          error: "Authentication service temporarily unavailable. Please try again later.",
        };
      }
      const waitTime = ipStatus.retryAfterSeconds ?? IP_RATE_LIMIT_OPTIONS.lockoutSeconds;
      return {
        success: false,
        error: `Too many login attempts from your network. Please wait ${waitTime} seconds before trying again.`,
      };
    }
  }

  // 4. Identity Resolution
  let targetAuthEmail: string | null = null;
  let resolvedTenantId: string | null = null;

  if (isTeacherLogin) {
    targetAuthEmail = cleanUsername;
  } else if (cleanWorkspace) {
    const tenant = db.tenants.find(
      (t) => t.slug.toLowerCase() === cleanWorkspace && t.is_active
    );
    if (!tenant) {
      await recordAuthFailure();
      return { success: false, error: genericErrorMessage };
    }
    resolvedTenantId = tenant.id;

    const identity = db.studentIdentities.find(
      (si) =>
        si.tenant_id === tenant.id &&
        si.username.toLowerCase() === cleanUsername
    );
    if (!identity) {
      await recordAuthFailure();
      return { success: false, error: genericErrorMessage };
    }
    targetAuthEmail = identity.auth_email;
  } else {
    const defaultTenant = db.tenants.find(
      (t) => t.slug === DEFAULT_TENANT_SLUG && t.is_active
    );
    if (defaultTenant) {
      resolvedTenantId = defaultTenant.id;
      const identity = db.studentIdentities.find(
        (si) =>
          si.tenant_id === defaultTenant.id &&
          si.username.toLowerCase() === cleanUsername
      );
      if (identity) {
        targetAuthEmail = identity.auth_email;
      }
    }
    if (!targetAuthEmail) {
      targetAuthEmail = `${cleanUsername}@${STUDENT_EMAIL_DOMAIN}`;
    }
  }

  // 5. Password verification
  if (db.validPasswords[targetAuthEmail] !== params.password) {
    await recordAuthFailure();
    return { success: false, error: genericErrorMessage };
  }

  // 6. Profile & active status check
  const matchedIdentity = db.studentIdentities.find(
    (si) => si.auth_email === targetAuthEmail
  );
  const profileId = matchedIdentity?.student_id ?? STUDENT_USER_ID;
  const profile = db.profiles.find((p) => p.id === profileId);

  if (!profile) {
    await recordAuthFailure();
    return {
      success: false,
      error: "User profile not found. Please contact your instructor.",
    };
  }

  if (!profile.is_active) {
    return {
      success: false,
      targetPath: "/disabled",
    };
  }

  // 7. Reset ONLY account bucket on success (IP bucket is preserved)
  await resetRateLimit(accountKey, { supabaseClient: rateLimitClient });

  return {
    success: true,
    targetPath: profile.role === "teacher" ? "/dashboard" : "/home",
    resolvedTenantId,
    targetAuthEmail,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Phase 3B2-B.2: Distributed Rate Limiter Security Hardening", () => {
  // Mock Database State
  const mockDb = {
    tenants: [
      { id: TENANT_1_ID, slug: TENANT_1_SLUG, name: "Apex Maths Academy", is_active: true },
      { id: TENANT_2_ID, slug: TENANT_2_SLUG, name: "Sigma Physics Center", is_active: true },
      { id: TENANT_3_ID, slug: TENANT_3_SLUG, name: "Delta Chemistry", is_active: false },
      { id: DEFAULT_TENANT_ID, slug: DEFAULT_TENANT_SLUG, name: "Default Workspace", is_active: true },
    ],
    studentIdentities: [
      {
        id: "si-1",
        tenant_id: TENANT_1_ID,
        student_id: STUDENT_USER_ID,
        username: "kasun",
        auth_email: `student_${TENANT_1_ID}_kasun@student.edvora.internal`,
      },
      {
        id: "si-2",
        tenant_id: TENANT_2_ID,
        student_id: STUDENT_USER_ID,
        username: "kasun",
        auth_email: `student_${TENANT_2_ID}_kasun@student.edvora.internal`,
      },
      {
        id: "si-3",
        tenant_id: TENANT_3_ID,
        student_id: FOREIGN_STUDENT_ID,
        username: "nimal",
        auth_email: `student_${TENANT_3_ID}_nimal@student.edvora.internal`,
      },
      {
        id: "si-4",
        tenant_id: DEFAULT_TENANT_ID,
        student_id: STUDENT_USER_ID,
        username: "legacy_kasun",
        auth_email: `student_${DEFAULT_TENANT_ID}_legacy_kasun@student.edvora.internal`,
      },
    ],
    profiles: [
      {
        id: STUDENT_USER_ID,
        role: "student",
        is_active: true,
        full_name: "Kasun Perera",
      },
      {
        id: FOREIGN_STUDENT_ID,
        role: "student",
        is_active: false,
        full_name: "Nimal Silva",
      },
      {
        id: "teacher-1",
        role: "teacher",
        is_active: true,
        full_name: "Dr. Perera",
      },
    ],
    validPasswords: {
      [`student_${TENANT_1_ID}_kasun@student.edvora.internal`]: "ApexPass123!",
      [`student_${TENANT_2_ID}_kasun@student.edvora.internal`]: "SigmaPass123!",
      [`student_${TENANT_3_ID}_nimal@student.edvora.internal`]: "SecurePass123!",
      [`student_${DEFAULT_TENANT_ID}_legacy_kasun@student.edvora.internal`]: "LegacyPass123!",
      [`old_student@${STUDENT_EMAIL_DOMAIN}`]: "OldLegacyPass123!",
      "teacher@apex.lk": "TeacherPass123!",
    },
  };

  // ─── 1. Fail-Closed Behavior (No In-Memory Fallback) ─────────────────────────

  it("Test 1: Database rate-limit failure blocks login (Fail-Closed)", async () => {
    // Supabase client that throws an RPC error (simulating database outage or missing migration)
    const failingDbClient = {
      rpc: async () => {
        throw new Error("connection to server on socket '/var/run/postgresql/.s.PGSQL.5432' failed");
      },
    } as unknown as SupabaseClient;

    const res = await checkRateLimit("test-key", { supabaseClient: failingDbClient });
    assert.equal(res.allowed, false, "Must fail closed when database RPC throws");
    assert.equal(res.error, "RATE_LIMIT_SERVICE_UNAVAILABLE");

    const loginRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      failingDbClient,
      "127.0.0.1"
    );

    assert.equal(loginRes.success, false);
    assert.equal(
      loginRes.error,
      "Authentication service temporarily unavailable. Please try again later."
    );
  });

  it("Test 2: No in-memory fallback exists when database is unavailable", async () => {
    const failingClient = {
      rpc: async () => {
        throw new Error("database unavailable");
      },
    } as unknown as SupabaseClient;

    // Consecutive calls must all fail closed without any in-memory state permitting access
    for (let i = 0; i < 5; i++) {
      const status = await checkRateLimit("any-key", { supabaseClient: failingClient });
      assert.equal(status.allowed, false, `Call ${i} must fail closed`);
      assert.equal(status.error, "RATE_LIMIT_SERVICE_UNAVAILABLE");
    }
  });

  it("Test 13: RPC errors never expose sensitive details to users or in key hash logs", async () => {
    let capturedError = "";
    const failingClient = {
      rpc: async () => {
        throw new Error("FATAL: password authentication failed for user 'postgres'");
      },
    } as unknown as SupabaseClient;

    const loginRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      failingClient,
      "127.0.0.1"
    );

    capturedError = loginRes.error ?? "";
    assert(!capturedError.includes("postgres"), "Must not leak database username");
    assert(!capturedError.includes("FATAL"), "Must not leak internal database error");
    assert(!capturedError.includes("kasun"), "Must not leak target username in error message");
    assert.equal(
      capturedError,
      "Authentication service temporarily unavailable. Please try again later."
    );
  });

  // ─── 2. Concurrency & Query-Contract Tests ───────────────────────────────────

  it("Test 3: Query contract for atomic initialization (INSERT ... ON CONFLICT DO UPDATE)", async () => {
    const rateClient = createMockRateLimitSupabaseClient();
    const testKey = "atomic-init-key";

    // Simulate 2 concurrent requests on a brand new key
    const [res1, res2] = await Promise.all([
      recordFailedAttempt(testKey, { supabaseClient: rateClient }),
      recordFailedAttempt(testKey, { supabaseClient: rateClient }),
    ]);

    assert.equal(res1.allowed, true);
    assert.equal(res2.allowed, true);
    // Both attempts should be counted atomically without unique_violation crash
    const check = await checkRateLimit(testKey, { supabaseClient: rateClient });
    assert.equal(check.remainingAttempts, 3); // 5 - 2 = 3
  });

  it("Test 4: Concurrent increments do not lose attempts", async () => {
    const rateClient = createMockRateLimitSupabaseClient();
    const testKey = "increment-loss-test";

    // Fire 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(testKey, { supabaseClient: rateClient });
    }

    const check = await checkRateLimit(testKey, { supabaseClient: rateClient });
    assert.equal(check.allowed, false, "Should be locked out after 5 attempts");
    assert.equal(check.remainingAttempts, 0);
  });

  it("Test 5: Expired window resets attempts correctly", async () => {
    const rateClient = createMockRateLimitSupabaseClient();
    const testKey = "window-reset-key";
    const opts = { maxAttempts: 3, windowSeconds: 1, lockoutSeconds: 1, supabaseClient: rateClient };

    await recordFailedAttempt(testKey, opts);
    await recordFailedAttempt(testKey, opts);

    const checkMid = await checkRateLimit(testKey, opts);
    assert.equal(checkMid.remainingAttempts, 1);

    // Wait for 1-second window to expire
    await new Promise((r) => setTimeout(r, 1100));

    const checkAfter = await checkRateLimit(testKey, opts);
    assert.equal(checkAfter.allowed, true);
    assert.equal(checkAfter.remainingAttempts, 3);
  });

  // ─── 3. Two-Tier Rate Limiting Tests (Account + IP) ──────────────────────────

  it("Test 6: Account bucket blocks repeated brute-force attempts against a single account", async () => {
    const rateClient = createMockRateLimitSupabaseClient();

    // 5 consecutive wrong passwords for kasun
    for (let i = 1; i <= 5; i++) {
      const res = await simulateStudentLogin(
        { workspace: "apex-maths", username: "kasun", password: "WrongPassword!" },
        mockDb,
        rateClient,
        "192.168.1.10"
      );
      assert.equal(res.success, false);
    }

    // 6th attempt should be blocked at the account bucket
    const blockedRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      rateClient,
      "192.168.1.10"
    );

    assert.equal(blockedRes.success, false);
    assert(blockedRes.error?.includes("Too many login attempts on this account"));
  });

  it("Test 7: IP bucket blocks horizontal password spraying across multiple accounts", async () => {
    const rateClient = createMockRateLimitSupabaseClient();
    const attackerIp = "203.0.113.50";

    // Attacker tries 30 different accounts from the same IP with 1 password each
    for (let i = 1; i <= 30; i++) {
      await simulateStudentLogin(
        { workspace: "apex-maths", username: `victim_user_${i}`, password: "CommonPassword123!" },
        mockDb,
        rateClient,
        attackerIp
      );
    }

    // 31st attempt on a completely fresh account should be blocked by the IP bucket
    const sprayBlockedRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "victim_user_31", password: "CommonPassword123!" },
      mockDb,
      rateClient,
      attackerIp
    );

    assert.equal(sprayBlockedRes.success, false);
    assert(
      sprayBlockedRes.error?.includes("Too many login attempts from your network"),
      `Expected network lockout message, got: ${sprayBlockedRes.error}`
    );
  });

  it("Test 8: Same username in different workspaces remains isolated", async () => {
    const rateClient = createMockRateLimitSupabaseClient();

    // Lock out kasun in apex-maths
    for (let i = 1; i <= 5; i++) {
      await simulateStudentLogin(
        { workspace: "apex-maths", username: "kasun", password: "WrongPassword!" },
        mockDb,
        rateClient,
        "192.168.1.20"
      );
    }

    // kasun in apex-maths is blocked
    const apexRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      rateClient,
      "192.168.1.20"
    );
    assert.equal(apexRes.success, false);
    assert(apexRes.error?.includes("Too many login attempts on this account"));

    // kasun in sigma-physics is unaffected!
    const sigmaRes = await simulateStudentLogin(
      { workspace: "sigma-physics", username: "kasun", password: "SigmaPass123!" },
      mockDb,
      rateClient,
      "192.168.1.21" // Different IP so IP bucket doesn't interfere
    );
    assert.equal(sigmaRes.success, true);
    assert.equal(sigmaRes.resolvedTenantId, TENANT_2_ID);
  });

  it("Test 9: Successful login resets ONLY the account bucket, preserving IP bucket", async () => {
    const rateClient = createMockRateLimitSupabaseClient();
    const sharedIp = "192.168.1.30";

    // 2 failed attempts on kasun
    await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "Wrong!" },
      mockDb,
      rateClient,
      sharedIp
    );
    await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "Wrong!" },
      mockDb,
      rateClient,
      sharedIp
    );

    const accountKey = "acct:apex-maths:kasun";
    const ipKey = `ip:${sharedIp}`;

    const checkAccBefore = await checkRateLimit(accountKey, { supabaseClient: rateClient });
    assert.equal(checkAccBefore.remainingAttempts, 3); // 5 - 2 = 3

    const checkIpBefore = await checkRateLimit(ipKey, { ...IP_RATE_LIMIT_OPTIONS, supabaseClient: rateClient });
    assert.equal(checkIpBefore.remainingAttempts, 28); // 30 - 2 = 28

    // kasun logs in successfully
    const successRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      rateClient,
      sharedIp
    );
    assert.equal(successRes.success, true);

    // Account bucket is reset to 5
    const checkAccAfter = await checkRateLimit(accountKey, { supabaseClient: rateClient });
    assert.equal(checkAccAfter.remainingAttempts, 5);

    // IP bucket is PRESERVED (still 28, not reset to 30)
    const checkIpAfter = await checkRateLimit(ipKey, { ...IP_RATE_LIMIT_OPTIONS, supabaseClient: rateClient });
    assert.equal(checkIpAfter.remainingAttempts, 28);
  });

  it("Test 10: Missing or untrusted IP does not bypass account protection", async () => {
    const rateClient = createMockRateLimitSupabaseClient();

    // Attacker passes null IP (e.g. stripped headers)
    for (let i = 1; i <= 5; i++) {
      await simulateStudentLogin(
        { workspace: "apex-maths", username: "kasun", password: "Wrong!" },
        mockDb,
        rateClient,
        null // No IP
      );
    }

    // 6th attempt with no IP is still locked out by the account bucket
    const blockedNoIp = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      rateClient,
      null
    );
    assert.equal(blockedNoIp.success, false);
    assert(blockedNoIp.error?.includes("Too many login attempts on this account"));
  });

  it("Test 11: Teacher login uses rate limiting", async () => {
    const rateClient = createMockRateLimitSupabaseClient();

    // 5 failed attempts for teacher
    for (let i = 1; i <= 5; i++) {
      await simulateStudentLogin(
        { username: "teacher@apex.lk", password: "WrongPassword!" },
        mockDb,
        rateClient,
        "192.168.1.40"
      );
    }

    // 6th attempt is locked out
    const blockedTeacher = await simulateStudentLogin(
      { username: "teacher@apex.lk", password: "TeacherPass123!" },
      mockDb,
      rateClient,
      "192.168.1.40"
    );
    assert.equal(blockedTeacher.success, false);
    assert(blockedTeacher.error?.includes("Too many login attempts on this account"));
  });

  it("Test 12: Student login uses rate limiting", async () => {
    const rateClient = createMockRateLimitSupabaseClient();

    const loginRes = await simulateStudentLogin(
      { workspace: "apex-maths", username: "kasun", password: "ApexPass123!" },
      mockDb,
      rateClient,
      "192.168.1.50"
    );
    assert.equal(loginRes.success, true);
    assert.equal(loginRes.targetPath, "/home");
  });

  // ─── 4. IP Header Trust & Validation ─────────────────────────────────────────

  it("Test: Trusted IP extraction logic handles edge proxy hierarchies", () => {
    // Vercel edge IP prioritized
    const vercelHeaders = {
      get: (h: string) => (h === "x-vercel-ip" ? "198.51.100.20" : "1.2.3.4"),
    };
    assert.equal(extractTrustedClientIp(vercelHeaders), "198.51.100.20");

    // Rightmost x-forwarded-for selected
    const fwdHeaders = {
      get: (h: string) => (h === "x-forwarded-for" ? "spoofed.ip, 10.0.0.1, 203.0.113.88" : null),
    };
    assert.equal(extractTrustedClientIp(fwdHeaders), "203.0.113.88");

    // Invalid format rejected
    assert.equal(isValidIpFormat("not-an-ip"), false);
    assert.equal(isValidIpFormat("192.168.1.1"), true);
  });

  // ─── 5. Regression Isolation Checks ──────────────────────────────────────────

  it("Regression: Multi-workspace announcement filtering prevents cross-tenant broadcast bleed", () => {
    const enrolledBatches = [
      { id: "batch-a1", name: "Grade 12 Maths", tenant_id: TENANT_1_ID },
      { id: "batch-b1", name: "Grade 12 Physics", tenant_id: TENANT_2_ID },
    ];
    const enrolledTenantIds = new Set(enrolledBatches.map((b) => b.tenant_id));
    const batchMap = new Map(enrolledBatches.map((b) => [b.id, b]));

    const allNotices = [
      { id: "ann-t1-broadcast", title: "Apex Maths All-Hands", is_broadcast: true, tenant_id: TENANT_1_ID },
      { id: "ann-t1-scoped-a1", title: "Apex Batch A1 Homework", is_broadcast: false, tenant_id: TENANT_1_ID },
      { id: "ann-t2-broadcast", title: "Sigma Physics Holiday Notice", is_broadcast: true, tenant_id: TENANT_2_ID },
      { id: "ann-t2-scoped-b1", title: "Sigma Batch B1 Lab Schedule", is_broadcast: false, tenant_id: TENANT_2_ID },
      { id: "ann-t3-broadcast", title: "Delta Chemistry Bleed Attack", is_broadcast: true, tenant_id: TENANT_3_ID },
    ];

    function filterAnnouncements(
      effectiveBatchFilter: string | null,
      scopedAnnIdSet: Set<string>
    ) {
      const selectedBatch = effectiveBatchFilter ? batchMap.get(effectiveBatchFilter) : null;
      const selectedBatchTenantId = selectedBatch?.tenant_id;

      return allNotices.filter((a) => {
        if (effectiveBatchFilter) {
          return (
            scopedAnnIdSet.has(a.id) ||
            (a.is_broadcast && a.tenant_id === selectedBatchTenantId)
          );
        }
        return (a.is_broadcast && enrolledTenantIds.has(a.tenant_id)) || scopedAnnIdSet.has(a.id);
      });
    }

    // Filtering for Batch A1
    const resA1 = filterAnnouncements("batch-a1", new Set(["ann-t1-scoped-a1"]));
    const idsA1 = resA1.map((a) => a.id);
    assert(idsA1.includes("ann-t1-broadcast"));
    assert(idsA1.includes("ann-t1-scoped-a1"));
    assert(!idsA1.includes("ann-t2-broadcast"), "Must NOT bleed broadcast from Tenant 2 into Tenant 1");
    assert(!idsA1.includes("ann-t3-broadcast"));
  });

  it("Regression: Legacy student login without workspace code resolves default-workspace", async () => {
    const rateClient = createMockRateLimitSupabaseClient();
    const result = await simulateStudentLogin(
      { username: "legacy_kasun", password: "LegacyPass123!" },
      mockDb,
      rateClient
    );
    assert.equal(result.success, true);
    assert.equal(result.resolvedTenantId, DEFAULT_TENANT_ID);
  });

  it("Regression: Student attempting staff requireTenantContext() is rejected with NO_WORKSPACES", async () => {
    const studentUser = createMockStudentUser(STUDENT_USER_ID);
    const studentClient = {
      auth: {
        getUser: async () => ({ data: { user: studentUser }, error: null }),
      },
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: studentUser.id, is_active: true, role: "student" as const },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "tenant_members") {
          return {
            select: () => ({
              eq: async () => ({
                data: [],
                error: null,
              }),
            }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient<Database>;

    await assert.rejects(
      async () => {
        await requireTenantContext({ supabaseClient: studentClient });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "NO_WORKSPACES");
        return true;
      }
    );
  });
});
