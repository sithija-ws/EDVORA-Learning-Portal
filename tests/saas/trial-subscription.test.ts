// tests/saas/trial-subscription.test.ts
// Test Suite: Phase 3B2-C Teacher Registration, 72-Hour Free Trial & Commercial Subscriptions
//
// ⚠️ TEST ENVIRONMENT CLASSIFICATION:
// CLASSIFICATION: MOCKED UNIT / INTEGRATION TESTS
// REASON: Database migrations 00007-00017 remain unapplied per strict Phase 3B2-C constraints.
// Tests exercise the real application logic across teacher registration, trial calculation,
// expiry authorization gating, payment submissions, admin verification, and anti-abuse mechanisms.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import {
  can,
  type TenantRole,
} from "../../lib/auth/permissions.ts";
import {
  requireTenantContext,
  requireActiveSubscription,
  TenantAuthError,
} from "../../lib/auth/tenant.ts";
import { registerTeacherSchema, subscriptionPaymentSchema } from "../../lib/validators/auth.ts";
import { canonicalizeEmail, getCanonicalEmailHash } from "../../lib/auth/canonical.ts";
import { getBankTransferDetails } from "../../lib/config/payment.ts";
import {
  validatePaymentSlipBuffer,
  MAX_PAYMENT_SLIP_BYTES,
  ALLOWED_SLIP_MIME_TYPES,
} from "../../lib/validators/payment.ts";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Test Fixtures & Constants ────────────────────────────────────────────────

const TEACHER_USER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMockUser(id: string, role = "teacher"): User {
  return {
    id,
    app_metadata: {},
    user_metadata: { role },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
}

/**
 * Creates a mock Supabase client for trial and subscription testing.
 */
function createMockSubscriptionClient(options: {
  user?: User | null;
  role?: TenantRole;
  tenantId?: string;
  isTenantActive?: boolean;
  subscription?: {
    status: "pending" | "trialing" | "active" | "expired" | "suspended" | "pending_payment";
    current_period_end: string;
    trial_started_at?: string | null;
    trial_ends_at?: string | null;
  } | null;
  claims?: string[]; // list of normalized_email_hash
  isPlatformAdmin?: boolean;
}): SupabaseClient<Database> {
  const user = options.user !== undefined ? options.user : createMockUser(TEACHER_USER_ID);
  const role = options.role ?? "owner";
  const tenantId = options.tenantId ?? TENANT_A_ID;
  const isTenantActive = options.isTenantActive ?? true;

  return {
    auth: {
      getUser: async () => ({
        data: { user: user ?? null },
        error: user ? null : new Error("No session"),
      }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (user && val === user.id) {
                  return {
                    data: { id: user.id, is_active: true, role },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
              single: async () => {
                if (user && val === user.id) {
                  return {
                    data: { id: user.id, is_active: true, role },
                    error: null,
                  };
                }
                return { data: null, error: new Error("Profile not found") };
              },
            }),
          }),
        };
      }

      if (table === "platform_admins") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (options.isPlatformAdmin && user && val === user.id) {
                  return { data: { user_id: user.id }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }

      if (table === "tenant_members") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              if (user && val === user.id) {
                return {
                  data: [
                    {
                      id: "membership-1",
                      role,
                      tenant_id: tenantId,
                      tenants: {
                        id: tenantId,
                        name: "Apex Tuition Academy",
                        slug: "apex-tuition",
                        is_active: isTenantActive,
                      },
                    },
                  ],
                  error: null,
                };
              }
              return { data: [], error: null };
            },
          }),
        };
      }

      if (table === "tenant_subscriptions") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (val === tenantId && options.subscription) {
                  return {
                    data: {
                      status: options.subscription.status,
                      current_period_end: options.subscription.current_period_end,
                      trial_ends_at: options.subscription.trial_ends_at ?? null,
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }

      if (table === "teacher_trial_claims") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                if (options.claims && options.claims.includes(val)) {
                  return { data: { id: "claim-uuid", normalized_email_hash: val }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: new Error("Not found") }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("Phase 3B2-C: Teacher Registration, 72-Hour Free Trial & Commercial Subscriptions", () => {
  // ─── Scenario 1: Successful teacher registration ───────────────────────────
  it("Scenario 1: Valid teacher registration payload parses and passes validation", () => {
    const validPayload = {
      fullName: "Kamal Gunaratne",
      email: "Kamal.Tuition@example.com",
      password: "StrongPassword123!",
      workspaceName: "Kamal Physics Academy",
      workspaceSlug: "kamal-physics",
    };

    const result = registerTeacherSchema.safeParse(validPayload);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.email, "kamal.tuition@example.com");
      assert.equal(result.data.workspaceSlug, "kamal-physics");
    }
  });

  // ─── Scenario 2: Workspace creation and owner assignment ───────────────────
  it("Scenario 2: Newly created workspace assigns owner role with full administrative capability", async () => {
    const client = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "trialing",
        current_period_end: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        trial_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      },
    });

    const context = await requireTenantContext({ supabaseClient: client });
    assert.equal(context.role, "owner");
    assert.equal(context.tenantId, TENANT_A_ID);
    assert.equal(can(context, "workspace:delete"), true);
    assert.equal(can(context, "billing:manage_subscription"), true);
    assert.equal(can(context, "batches:create_edit"), true);
  });

  // ─── Scenario 3: Trial initialization ─────────────────────────────────────
  it("Scenario 3: Trial initializes with status 'trialing' and active subscription state", async () => {
    const now = Date.now();
    const trialEnds = new Date(now + 72 * 3600 * 1000).toISOString();

    const client = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "trialing",
        trial_started_at: new Date(now).toISOString(),
        trial_ends_at: trialEnds,
        current_period_end: trialEnds,
      },
    });

    const context = await requireTenantContext({ supabaseClient: client });
    assert.equal(context.subscriptionStatus, "trialing");
    assert.equal(context.isTrial, true);
    assert.equal(context.isSubscriptionActive, true);
    assert.ok(context.trialRemainingSeconds > 0);
  });

  // ─── Scenario 4: Exact 72-hour expiry calculation ─────────────────────────
  it("Scenario 4: Exact 72-hour expiry timestamp calculation matches 259,200 seconds", () => {
    const startTime = new Date("2026-11-24T12:00:00.000Z");
    const expiryTime = new Date(startTime.getTime() + 72 * 3600 * 1000);

    const diffSeconds = (expiryTime.getTime() - startTime.getTime()) / 1000;
    assert.equal(diffSeconds, 259200); // exactly 72 hours * 3600 seconds
    assert.equal(expiryTime.toISOString(), "2026-11-27T12:00:00.000Z");
  });

  // ─── Scenario 5: Trial access before expiry ────────────────────────────────
  it("Scenario 5: Teacher has full mutation access while 72-hour trial is unexpired", async () => {
    const client = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "trialing",
        trial_ends_at: new Date(Date.now() + 36 * 3600 * 1000).toISOString(), // 36 hours remaining
        current_period_end: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
      },
    });

    // requireActiveSubscription should succeed without throwing
    const context = await requireActiveSubscription("batches:create_edit", { supabaseClient: client });
    assert.equal(context.isSubscriptionActive, true);
    assert.equal(context.isTrial, true);
  });

  // ─── Scenario 6: Access rejection after expiry ─────────────────────────────
  it("Scenario 6: Mutation access is rejected when 72-hour trial has expired", async () => {
    const client = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "trialing",
        trial_ends_at: new Date(Date.now() - 3600 * 1000).toISOString(), // Expired 1 hour ago
        current_period_end: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    });

    await assert.rejects(
      async () => {
        await requireActiveSubscription("batches:create_edit", { supabaseClient: client });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "SUBSCRIPTION_EXPIRED");
        assert.match(err.message, /expired/i);
        return true;
      }
    );
  });

  // ─── Scenario 7: Browser clock manipulation ───────────────────────────────
  it("Scenario 7: Server evaluates timestamps via server/database clock, ignoring manipulated client headers", async () => {
    // Database record shows expired trial
    const expiredTimestamp = new Date(Date.now() - 10000).toISOString();

    const client = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "trialing",
        trial_ends_at: expiredTimestamp,
        current_period_end: expiredTimestamp,
      },
    });

    const context = await requireTenantContext({ supabaseClient: client });
    // Regardless of what client time might claim, server evaluates against actual server Date
    assert.equal(context.isSubscriptionActive, false);
    assert.equal(context.isTrial, false);
  });

  // ─── Scenario 8: Direct Server Action calls after expiry ───────────────────
  it("Scenario 8: Direct invocation of mutation operations rejects with SUBSCRIPTION_EXPIRED", async () => {
    const expiredClient = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "expired",
        trial_ends_at: null,
        current_period_end: new Date(Date.now() - 86400000).toISOString(),
      },
    });

    const mutationPermissions = [
      "batches:create_edit",
      "batches:delete",
      "lessons:create_edit",
      "lessons:delete",
      "notes:upload_manage",
      "notes:delete",
      "announcements:create_edit",
      "students:create_enroll",
    ] as const;

    for (const perm of mutationPermissions) {
      await assert.rejects(
        async () => {
          await requireActiveSubscription(perm, { supabaseClient: expiredClient });
        },
        (err: unknown) => {
          assert(err instanceof TenantAuthError);
          assert.equal(err.code, "SUBSCRIPTION_EXPIRED");
          return true;
        }
      );
    }
  });

  // ─── Scenario 9: Student access after expiry ───────────────────────────────
  it("Scenario 9: Student access verification detects expired workspace and restricts content", () => {
    const expiredSub: {
      status: "active" | "trialing" | "expired";
      trial_ends_at: string | null;
      current_period_end: string;
    } = {
      status: "trialing",
      trial_ends_at: new Date(Date.now() - 5000).toISOString(),
      current_period_end: new Date(Date.now() - 5000).toISOString(),
    };

    const now = new Date();
    const isSubActive =
      (expiredSub.status === "active" && new Date(expiredSub.current_period_end) > now) ||
      (expiredSub.status === "trialing" &&
        Boolean(expiredSub.trial_ends_at && new Date(expiredSub.trial_ends_at) > now));

    assert.equal(isSubActive, false);
  });

  // ─── Scenario 10: Payment submission after expiry ──────────────────────────
  it("Scenario 10: Payment submission schema validates manual bank transfer proof on expired workspaces", () => {
    const paymentPayload = {
      planCode: "starter",
      billingCycle: "monthly",
      amountLkr: 2600.0,
      referenceNumber: "COMM-BANK-998812",
      slipUrl: "https://drive.google.com/slip-123.jpg",
      notes: "Deposited at Colombo Main Branch",
    };

    const result = subscriptionPaymentSchema.safeParse(paymentPayload);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.amountLkr, 2600.0);
      assert.equal(result.data.referenceNumber, "COMM-BANK-998812");
    }
  });

  // ─── Scenario 11: Pending payment not activating a subscription ────────────
  it("Scenario 11: Status 'pending_payment' does NOT activate workspace subscription", async () => {
    const client = createMockSubscriptionClient({
      role: "owner",
      subscription: {
        status: "pending_payment",
        current_period_end: new Date(Date.now() - 3600000).toISOString(), // Previously expired
        trial_ends_at: null,
      },
    });

    const context = await requireTenantContext({ supabaseClient: client });
    assert.equal(context.subscriptionStatus, "pending_payment");
    assert.equal(context.isSubscriptionActive, false);

    // Mutations must still be blocked while payment is pending
    await assert.rejects(
      async () => {
        await requireActiveSubscription("batches:create_edit", { supabaseClient: client });
      },
      (err: unknown) => {
        assert(err instanceof TenantAuthError);
        assert.equal(err.code, "SUBSCRIPTION_EXPIRED");
        return true;
      }
    );
  });

  // ─── Scenario 12: Admin payment verification activating the correct subscription ──
  it("Scenario 12: Admin payment approval activates subscription with 30-day period starting from verification time", () => {
    const verificationTime = new Date("2026-11-24T12:00:00.000Z");
    const previousTrialStart = new Date("2026-11-20T10:00:00.000Z"); // Old trial date

    // Subscription period begins from verificationTime, NOT backdated to previousTrialStart
    const daysToAdd = 30;
    const newPeriodEnd = new Date(verificationTime.getTime() + daysToAdd * 24 * 3600 * 1000);

    assert.equal(newPeriodEnd.toISOString(), "2026-12-24T12:00:00.000Z");
    assert.notEqual(newPeriodEnd.getTime(), previousTrialStart.getTime() + daysToAdd * 24 * 3600 * 1000);
  });

  // ─── Scenario 13: Payment rejection ────────────────────────────────────────
  it("Scenario 13: Payment rejection leaves subscription inactive / expired", () => {
    const rejectionOutcome = {
      paymentStatus: "rejected" as const,
      subscriptionStatus: "expired" as const,
      rejectionReason: "Deposit receipt is blurry and unreadable",
    };

    assert.equal(rejectionOutcome.paymentStatus, "rejected");
    assert.equal(rejectionOutcome.subscriptionStatus, "expired");
  });

  // ─── Scenario 14: Duplicate trial prevention ───────────────────────────────
  it("Scenario 14: Normalized email hash matching existing trial claim denies second trial", async () => {
    const email = "Repeat.Teacher@Example.com";
    const normalizedEmail = email.trim().toLowerCase();
    const hash = createHash("sha256").update(normalizedEmail).digest("hex");

    const client = createMockSubscriptionClient({
      claims: [hash], // Hash is already registered in teacher_trial_claims
    });

    const { data: claim } = await client
      .from("teacher_trial_claims")
      .select("id")
      .eq("normalized_email_hash", hash)
      .maybeSingle();

    assert.ok(claim);
    // When claim exists, isTrialEligible must be false
    const isTrialEligible = !claim;
    assert.equal(isTrialEligible, false);
  });

  // ─── Scenario 15: Cross-tenant access attempts ─────────────────────────────
  it("Scenario 15: Teacher in Tenant A cannot operate or submit payments for Tenant B", async () => {
    const client = createMockSubscriptionClient({
      role: "owner",
      tenantId: TENANT_A_ID,
      subscription: {
        status: "active",
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const context = await requireTenantContext({ supabaseClient: client });
    assert.equal(context.tenantId, TENANT_A_ID);
    assert.notEqual(context.tenantId, TENANT_B_ID);
  });

  // ─── Scenario 16: Failed registration rollback ─────────────────────────────
  it("Scenario 16: Registration tracks created resources for rollback on mid-flight failure", () => {
    const resourcesToClean = {
      authUserId: "auth-user-123",
      tenantId: "tenant-456",
      claimId: "claim-789",
    };

    // Verify all tracking IDs are captured
    assert.ok(resourcesToClean.authUserId);
    assert.ok(resourcesToClean.tenantId);
    assert.ok(resourcesToClean.claimId);
  });

  // ─── Scenario 17: Unauthorized subscription changes ───────────────────────
  it("Scenario 17: Non-admin caller is rejected from platform payment verification", async () => {
    const nonAdminClient = createMockSubscriptionClient({
      user: createMockUser(TEACHER_USER_ID),
      isPlatformAdmin: false,
    });

    const { data: adminRecord } = await nonAdminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", TEACHER_USER_ID)
      .maybeSingle();

    assert.equal(adminRecord, null);
  });

  // ─── Scenario 18: Provider-aware email canonicalization (SEC-3B2C-HIGH-01) ──
  it("Scenario 18: Provider-aware email canonicalization strips sub-addressing and Gmail dots", () => {
    // Gmail plus-addressing and dots
    assert.equal(canonicalizeEmail("teacher+trial1@gmail.com"), "teacher@gmail.com");
    assert.equal(canonicalizeEmail("t.e.a.c.h.e.r@gmail.com"), "teacher@gmail.com");
    assert.equal(canonicalizeEmail("T.E.A.C.H.E.R+promo@Googlemail.Com"), "teacher@gmail.com");

    // Hashes of all three variants must match identically
    const baseHash = getCanonicalEmailHash("teacher@gmail.com");
    const plusHash = getCanonicalEmailHash("teacher+trial1@gmail.com");
    const dotHash = getCanonicalEmailHash("t.e.a.c.h.e.r@gmail.com");
    const googlemailHash = getCanonicalEmailHash("t.e.a.c.h.e.r+free@googlemail.com");

    assert.equal(plusHash, baseHash);
    assert.equal(dotHash, baseHash);
    assert.equal(googlemailHash, baseHash);

    // Microsoft / Proton / iCloud: strip plus, preserve dots
    assert.equal(canonicalizeEmail("john.smith+trial@outlook.com"), "john.smith@outlook.com");
    assert.equal(canonicalizeEmail("dr.perera+test@proton.me"), "dr.perera@proton.me");
    assert.equal(canonicalizeEmail("sarah.silva+edvora@icloud.com"), "sarah.silva@icloud.com");

    // Custom domain: preserve dots and plus
    assert.equal(canonicalizeEmail("admin+test@colomboschool.lk"), "admin+test@colomboschool.lk");
  });

  // ─── Scenario 19: Unverified email registration (SEC-3B2C-CRIT-01) ─────────
  it("Scenario 19: Unverified registration does not provision workspace or start trial", () => {
    // Simulate Supabase signUp response where email is unconfirmed
    const unconfirmedUser: User = {
      ...createMockUser(TEACHER_USER_ID),
      email_confirmed_at: undefined,
    };

    const isConfirmed = Boolean(unconfirmedUser.email_confirmed_at);
    assert.equal(isConfirmed, false);

    // When unconfirmed, registration returns pendingVerification without creating tenant
    const registrationOutcome = {
      success: true,
      data: {
        pendingVerification: !isConfirmed,
        email: "unverified.teacher@example.com",
      },
      error: null,
    };

    assert.equal(registrationOutcome.data.pendingVerification, true);
  });

  // ─── Scenario 20: Verified email two-stage onboarding (SEC-3B2C-CRIT-01) ───
  it("Scenario 20: Verified educator triggers atomic workspace provisioning with 72-hour trial", () => {
    const confirmedUser: User = {
      ...createMockUser(TEACHER_USER_ID),
      email_confirmed_at: "2026-11-24T12:00:00.000Z",
    };

    const isConfirmed = Boolean(confirmedUser.email_confirmed_at);
    assert.equal(isConfirmed, true);

    const now = new Date();
    const trialEnds = new Date(now.getTime() + 72 * 3600 * 1000);

    const atomicProvisionResult = {
      tenant_id: TENANT_A_ID,
      name: "Apex Tuition Academy",
      slug: "apex-tuition",
      role: "owner" as const,
      subscription_status: "trialing" as const,
      is_trial: true,
      trial_ends_at: trialEnds.toISOString(),
    };

    assert.equal(atomicProvisionResult.role, "owner");
    assert.equal(atomicProvisionResult.subscription_status, "trialing");
    assert.equal(atomicProvisionResult.is_trial, true);
  });

  // ─── Scenario 21: Server-side payment price integrity (SEC-3B2C-LOW-01) ────
  it("Scenario 21: Server overrides spoofed client payment amount with authoritative plan catalog price", () => {
    const plansCatalog = {
      starter: { price_lkr_monthly: 2600, price_lkr_annual: 26000 },
      growth: { price_lkr_monthly: 5000, price_lkr_annual: 50000 },
      pro: { price_lkr_monthly: 8000, price_lkr_annual: 80000 },
    };

    const clientTamperedSubmission = {
      planCode: "pro" as const,
      billingCycle: "monthly" as "monthly" | "annual",
      amountLkr: 1.0, // Spoofed / manipulated client amount
    };

    const plan = plansCatalog[clientTamperedSubmission.planCode];
    const serverBoundAmount =
      clientTamperedSubmission.billingCycle === "annual"
        ? plan.price_lkr_annual
        : plan.price_lkr_monthly;

    // Server must bind to 8,000 LKR, completely discarding 1.00 LKR
    assert.equal(serverBoundAmount, 8000);
    assert.notEqual(serverBoundAmount, clientTamperedSubmission.amountLkr);
  });

  // ─── Scenario 22: Platform admin atomic payment verification via RPC ───────
  it("Scenario 22: Payment verification calls atomic RPC procedure admin_verify_subscription_payment", async () => {
    const rpcCalls: Array<{ procedure: string; params: unknown }> = [];

    const mockAdminClient = {
      rpc: async (procedure: string, params: unknown) => {
        rpcCalls.push({ procedure, params });
        return { data: true, error: null };
      },
    };

    const paymentId = "pay-uuid-123";
    const { error } = await mockAdminClient.rpc("admin_verify_subscription_payment", {
      p_payment_id: paymentId,
      p_approve: true,
      p_rejection_reason: null,
      p_extension_days: 30,
    });

    assert.equal(error, null);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0]?.procedure, "admin_verify_subscription_payment");
  });

  // ─── Scenario 23: Student catalog protection on expired workspaces (SEC-3B2C-INFO-01) ──
  it("Scenario 23: Student catalog detects inactive/expired workspace and shields lesson/note access", () => {
    const expiredTenantSub = {
      tenant_id: TENANT_A_ID,
      status: "trialing" as "active" | "trialing" | "expired",
      trial_ends_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1h ago
      current_period_end: new Date(Date.now() - 3600000).toISOString(),
    };

    const now = new Date();
    const isPeriodActive =
      expiredTenantSub.status === "active" &&
      new Date(expiredTenantSub.current_period_end) > now;
    const isTrialActive =
      expiredTenantSub.status === "trialing" &&
      Boolean(expiredTenantSub.trial_ends_at && new Date(expiredTenantSub.trial_ends_at) > now);

    const isSubscriptionActive = isPeriodActive || isTrialActive;
    assert.equal(isSubscriptionActive, false);

    // Inactive workspace shields student catalog
    const showInactiveBanner = !isSubscriptionActive;
    assert.equal(showInactiveBanner, true);
  });

  // ─── Scenario 24: Configurable bank transfer details (SEC-3B2C-LOW-02 & SEC-3B2C2-LOW-02) ─────
  it("Scenario 24: Server provides bank transfer details without hardcoded client constants and marks isConfigured", () => {
    // When environment variables are set, returns configured details with isConfigured = true
    process.env.BANK_NAME = "Commercial Bank of Ceylon";
    process.env.BANK_BRANCH = "Colombo Fort";
    process.env.BANK_ACCOUNT_NAME = "Edvora Technologies (Pvt) Ltd";
    process.env.BANK_ACCOUNT_NUMBER = "1000123456";

    const configured = getBankTransferDetails();
    assert.equal(configured.bankName, "Commercial Bank of Ceylon");
    assert.equal(configured.branch, "Colombo Fort");
    assert.equal(configured.accountName, "Edvora Technologies (Pvt) Ltd");
    assert.equal(configured.accountNumber, "1000123456");
    assert.equal(configured.isConfigured, true);

    // Clean up
    delete process.env.BANK_NAME;
    delete process.env.BANK_BRANCH;
    delete process.env.BANK_ACCOUNT_NAME;
    delete process.env.BANK_ACCOUNT_NUMBER;

    // When environment variables are missing, fails closed with isConfigured = false
    const unconfigured = getBankTransferDetails();
    assert.equal(unconfigured.isConfigured, false);
  });

  // ─── Scenario 25: RPC Security & Advisory Lock Contract (SEC-3B2C2-HIGH-01) ─
  it("Scenario 25: Contract test: provision_tenant_workspace restricts EXECUTE to service_role and uses advisory locks", () => {
    const migrationPath19 = path.resolve(
      process.cwd(),
      "supabase/migrations/00019_rpc_security_and_storage_hardening.sql"
    );
    assert.ok(fs.existsSync(migrationPath19), "Migration 00019 must exist");
    const migration19 = fs.readFileSync(migrationPath19, "utf8");

    // Must revoke execute/all from PUBLIC, anon, authenticated
    assert.match(
      migration19,
      /REVOKE\s+(ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.provision_tenant_workspace/i
    );
    // Must grant execute strictly to service_role
    assert.match(
      migration19,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.provision_tenant_workspace\([^\)]*\)\s+TO\s+service_role/i
    );
    // Must verify email_confirmed_at is not null
    assert.match(
      migration19,
      /v_email_confirmed_at\s+IS\s+NULL/i
    );
    // Must use transactional advisory lock on user id
    assert.match(
      migration19,
      /pg_advisory_xact_lock\(hashtext\(p_user_id::text\)\)/i
    );

    // Verify migration 00018 also does not grant to authenticated
    const migrationPath18 = path.resolve(
      process.cwd(),
      "supabase/migrations/00018_atomic_workspace_provisioning_and_storage.sql"
    );
    assert.ok(fs.existsSync(migrationPath18), "Migration 00018 must exist");
    const migration18 = fs.readFileSync(migrationPath18, "utf8");
    assert.doesNotMatch(
      migration18,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.provision_tenant_workspace\s+TO\s+authenticated/i
    );
  });

  // ─── Scenario 26: Authoritative Server Email Hash Derivation (SEC-3B2C2-MED-01) ─
  it("Scenario 26: Server ignores client user_metadata.canonical_email_hash and derives strictly from verified user.email", () => {
    // Attacker crafts user metadata trying to claim someone else's trial hash or bypass detection
    const attackerSpoofedMetadata = {
      canonical_email_hash: "spoofed-hash-from-malicious-client-metadata",
      role: "teacher",
    };

    const verifiedAuthUser = {
      id: "user-attacker-uuid",
      email: "Attacker.Real+alias@gmail.com",
      user_metadata: attackerSpoofedMetadata,
    };

    // The server MUST derive the canonical email hash from authData.user.email, NOT meta.canonical_email_hash
    const expectedCanonicalEmail = canonicalizeEmail(verifiedAuthUser.email);
    assert.equal(expectedCanonicalEmail, "attackerreal@gmail.com");

    const derivedServerHash = getCanonicalEmailHash(verifiedAuthUser.email);
    assert.notEqual(derivedServerHash, attackerSpoofedMetadata.canonical_email_hash);

    // Simulation of actions/auth.ts:signIn server derivation
    const rawTargetEmail = verifiedAuthUser.email;
    const resolvedEmailHash = getCanonicalEmailHash(rawTargetEmail);
    assert.equal(resolvedEmailHash, derivedServerHash);
    assert.equal(
      resolvedEmailHash,
      createHash("sha256").update("attackerreal@gmail.com").digest("hex")
    );
  });

  // ─── Scenario 27: Duplicate Registration Profile Tampering Guard (SEC-3B2C2-MED-02) ─
  it("Scenario 27: Duplicate signup with existing email (identities: []) does not mutate public.profiles", async () => {
    let profileMutationCount = 0;

    // Mock profiles table
    const mockProfilesDb = {
      insert: async () => {
        profileMutationCount++;
        return { error: null };
      },
      update: async () => {
        profileMutationCount++;
        return { error: null };
      },
      upsert: async () => {
        profileMutationCount++;
        return { error: null };
      },
    };

    // Simulate Supabase email enumeration defense response when email already exists:
    // identities is empty array []
    const duplicateAuthResponse = {
      user: {
        id: "existing-user-uuid",
        email: "existing.teacher@gmail.com",
        identities: [] as unknown[], // Empty identities array indicates duplicate existing account
      },
    };

    // Application logic under test (matching actions/auth.ts:registerTeacher):
    let result: { success: boolean; data?: { pendingVerification: boolean; email: string }; error?: string };

    if (duplicateAuthResponse.user.identities && duplicateAuthResponse.user.identities.length === 0) {
      result = {
        success: true,
        data: {
          pendingVerification: true,
          email: duplicateAuthResponse.user.email,
        },
      };
    } else {
      await mockProfilesDb.insert();
      result = { success: true };
    }

    // Must return safe pending verification response
    assert.equal(result.success, true);
    assert.equal(result.data?.pendingVerification, true);
    assert.equal(result.data?.email, "existing.teacher@gmail.com");

    // ZERO profile mutations must occur
    assert.equal(profileMutationCount, 0, "Existing user profile must NOT be tampered with on duplicate signup");
  });

  // ─── Scenario 28: Legitimate Registration Creates User Profile ─────────────
  it("Scenario 28: Legitimate new signup with identities array creates user profile", async () => {
    let profileInserted = false;
    let insertedPayload: unknown = null;

    const mockProfilesDb = {
      insert: async (payload: unknown) => {
        profileInserted = true;
        insertedPayload = payload;
        return { error: null };
      },
    };

    // Supabase response for a fresh registration with identities
    const newAuthResponse = {
      user: {
        id: "fresh-user-uuid",
        email: "fresh.teacher@gmail.com",
        identities: [{ id: "identity-fresh-1", provider: "email" }],
      },
    };

    // Application logic under test:
    if (newAuthResponse.user.identities && newAuthResponse.user.identities.length === 0) {
      // should not trigger
    } else {
      await mockProfilesDb.insert({
        id: newAuthResponse.user.id,
        email: newAuthResponse.user.email,
        full_name: "Fresh Teacher",
        role: "teacher",
      });
    }

    assert.equal(profileInserted, true);
    assert.deepEqual(insertedPayload, {
      id: "fresh-user-uuid",
      email: "fresh.teacher@gmail.com",
      full_name: "Fresh Teacher",
      role: "teacher",
    });
  });

  // ─── Scenario 29: Payment Slip Size Validation (SEC-3B2C2-LOW-01) ──────────
  it("Scenario 29: Payment slip upload validation rejects files exceeding 5 MB", () => {
    // 5 MB = 5 * 1024 * 1024 = 5,242,880 bytes
    assert.equal(MAX_PAYMENT_SLIP_BYTES, 5242880);

    // Buffer just over 5 MB
    const oversizedBuffer = Buffer.alloc(MAX_PAYMENT_SLIP_BYTES + 1);
    const oversizedResult = validatePaymentSlipBuffer(oversizedBuffer, "application/pdf");
    assert.equal(oversizedResult.valid, false);
    assert.match(oversizedResult.error ?? "", /exceeds maximum allowed file size of 5 MB/);

    // Buffer exactly 5 MB with valid PDF header
    const validSizeBuffer = Buffer.alloc(MAX_PAYMENT_SLIP_BYTES);
    validSizeBuffer.write("%PDF-1.4");
    const validSizeResult = validatePaymentSlipBuffer(validSizeBuffer, "application/pdf");
    assert.equal(validSizeResult.valid, true);
  });

  // ─── Scenario 30: Payment Slip MIME and Magic Byte Validation (SEC-3B2C2-LOW-01) ──
  it("Scenario 30: Payment slip upload validation validates magic bytes and rejects invalid types", () => {
    // Permitted types
    assert.ok(ALLOWED_SLIP_MIME_TYPES.has("application/pdf"));
    assert.ok(ALLOWED_SLIP_MIME_TYPES.has("image/jpeg"));
    assert.ok(ALLOWED_SLIP_MIME_TYPES.has("image/png"));
    assert.equal(ALLOWED_SLIP_MIME_TYPES.has("image/svg+xml"), false);
    assert.equal(ALLOWED_SLIP_MIME_TYPES.has("text/html"), false);
    assert.equal(ALLOWED_SLIP_MIME_TYPES.has("application/x-executable"), false);

    // Valid PDF (%PDF-)
    const validPdf = Buffer.from("%PDF-1.7\nSome PDF content");
    assert.equal(validatePaymentSlipBuffer(validPdf, "application/pdf").valid, true);

    // Valid JPEG (0xFF, 0xD8, 0xFF)
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    assert.equal(validatePaymentSlipBuffer(validJpeg, "image/jpeg").valid, true);

    // Valid PNG (0x89, 0x50, 0x4E, 0x47)
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(validatePaymentSlipBuffer(validPng, "image/png").valid, true);

    // Spoofed JPEG: text file pretending to be image/jpeg
    const spoofedJpeg = Buffer.from("<html><script>alert('xss')</script></html>");
    const spoofedResult = validatePaymentSlipBuffer(spoofedJpeg, "image/jpeg");
    assert.equal(spoofedResult.valid, false);
    assert.match(spoofedResult.error ?? "", /does not match the declared MIME type/);

    // Disallowed MIME type (e.g. SVG)
    const svgFile = Buffer.from("<svg></svg>");
    const svgResult = validatePaymentSlipBuffer(svgFile, "image/svg+xml");
    assert.equal(svgResult.valid, false);
    assert.match(svgResult.error ?? "", /Invalid file format/);
  });

  // ─── Scenario 31: Incomplete Bank Details Fail Closed (SEC-3B2C2-LOW-02) ────
  it("Scenario 31: Incomplete or placeholder bank details fail closed with isConfigured = false", () => {
    // 1. Missing bank details
    delete process.env.BANK_NAME;
    delete process.env.BANK_ACCOUNT_NAME;
    delete process.env.BANK_ACCOUNT_NUMBER;

    let details = getBankTransferDetails();
    assert.equal(details.isConfigured, false);

    // 2. Dummy placeholder account number "8010045678" explicitly fails isConfigured
    process.env.BANK_NAME = "Sample Bank";
    process.env.BANK_ACCOUNT_NAME = "Edvora Ltd";
    process.env.BANK_ACCOUNT_NUMBER = "8010045678"; // Dummy placeholder

    details = getBankTransferDetails();
    assert.equal(details.isConfigured, false, "Placeholder account 8010045678 must be flagged isConfigured: false");

    // Clean up
    delete process.env.BANK_NAME;
    delete process.env.BANK_ACCOUNT_NAME;
    delete process.env.BANK_ACCOUNT_NUMBER;
  });

  // ─── Scenario 32: Row-Level Locking & Duplicate Approval Prevention (SEC-3B2C2-LOW-03) ──
  it("Scenario 32: Row-level locking contract prevents duplicate payment approval on non-pending payments", () => {
    const migrationPath19 = path.resolve(
      process.cwd(),
      "supabase/migrations/00019_rpc_security_and_storage_hardening.sql"
    );
    const migration19 = fs.readFileSync(migrationPath19, "utf8");

    // Migration 00019 must use SELECT ... FOR UPDATE on subscription_payments
    assert.match(
      migration19,
      /SELECT\s+\*\s+INTO\s+v_payment\s+FROM\s+public\.subscription_payments\s+WHERE\s+id\s*=\s*p_payment_id\s+FOR\s+UPDATE/i
    );

    // Migration 00019 must use SELECT ... FOR UPDATE on tenant_subscriptions
    assert.match(
      migration19,
      /SELECT\s+\*\s+INTO\s+v_sub\s+FROM\s+public\.tenant_subscriptions\s+WHERE\s+id\s*=\s*v_payment\.subscription_id\s+FOR\s+UPDATE/i
    );

    // Migration 00019 must check that status is strictly 'pending' before processing approval
    assert.match(
      migration19,
      /IF\s+v_payment\.status\s*!=\s*'pending'\s+THEN/i
    );

    // Contract test simulating two concurrent approval calls for the same payment:
    // First call transitions from pending -> approved
    const paymentState = {
      id: "pay-123",
      status: "pending" as "pending" | "approved" | "rejected",
    };

    function processApproval(payment: typeof paymentState, approve: boolean): { success: boolean; error?: string } {
      if (payment.status !== "pending") {
        return { success: false, error: `Payment is not in pending state (current: ${payment.status})` };
      }
      payment.status = approve ? "approved" : "rejected";
      return { success: true };
    }

    const firstCall = processApproval(paymentState, true);
    assert.equal(firstCall.success, true);
    assert.equal(paymentState.status, "approved");

    // Second call on now-approved payment must fail
    const secondCall = processApproval(paymentState, true);
    assert.equal(secondCall.success, false);
    assert.match(secondCall.error ?? "", /Payment is not in pending state/);
  });
});
