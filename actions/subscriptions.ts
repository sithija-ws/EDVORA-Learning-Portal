// actions/subscriptions.ts
// Server Actions for commercial billing, manual payment submissions,
// and platform admin payment verification with strict multi-tenant isolation.

"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServerAdminClient } from "@/lib/supabase/server";
import { requireTenantContext, TenantAuthError } from "@/lib/auth/tenant";
import { subscriptionPaymentSchema } from "@/lib/validators/auth";
import { getBankTransferDetails } from "@/lib/config/payment";
import { validatePaymentSlipBuffer } from "@/lib/validators/payment";
import type { ActionResult } from "@/types";

/**
 * Submits a manual bank transfer deposit slip and payment reference for workspace subscription activation.
 * Enforces server-side pricing integrity (SEC-3B2C-LOW-01) by deriving amount_lkr strictly from catalog pricing.
 * Validates corporate banking configuration (SEC-3B2C2-LOW-02) and payment receipt uploads (SEC-3B2C2-LOW-01).
 * Transitions tenant subscription status to 'pending_payment'.
 */
export async function submitSubscriptionPayment(
  _prevState: ActionResult<{ paymentId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ paymentId: string }>> {
  let context;
  try {
    // Only workspace owners or admins may submit commercial subscription payments
    context = await requireTenantContext();
    if (context.role !== "owner" && context.role !== "admin") {
      throw new TenantAuthError("Forbidden: Workspace owner or administrator required", "INSUFFICIENT_PERMISSIONS");
    }
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Authentication required",
    };
  }

  // SEC-3B2C2-LOW-02: Fail closed if corporate banking coordinates are unconfigured
  const bankConfig = getBankTransferDetails();
  if (!bankConfig.isConfigured) {
    return {
      success: false,
      data: null,
      error: "Manual bank payments are currently unavailable. Bank instructions are not configured.",
    };
  }

  const rawPlanCode = formData.get("planCode");
  const rawBillingCycle = formData.get("billingCycle");
  const rawAmountLkr = formData.get("amountLkr");
  const rawReferenceNumber = formData.get("referenceNumber");
  const rawSlipUrl = formData.get("slipUrl");
  const rawNotes = formData.get("notes");
  const rawSlipFile = formData.get("slipFile");

  const parseResult = subscriptionPaymentSchema.safeParse({
    planCode: typeof rawPlanCode === "string" ? rawPlanCode : "",
    billingCycle: typeof rawBillingCycle === "string" ? rawBillingCycle : "monthly",
    amountLkr: rawAmountLkr ? Number(rawAmountLkr) : NaN,
    referenceNumber: typeof rawReferenceNumber === "string" ? rawReferenceNumber : "",
    slipUrl: typeof rawSlipUrl === "string" && rawSlipUrl.trim() !== "" ? rawSlipUrl : undefined,
    notes: typeof rawNotes === "string" && rawNotes.trim() !== "" ? rawNotes : undefined,
  });

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return {
      success: false,
      data: null,
      error: firstIssue?.message ?? "Invalid payment submission details",
    };
  }

  const { planCode, billingCycle, referenceNumber, slipUrl, notes } = parseResult.data;
  const adminClient = createServerAdminClient();

  // SEC-3B2C2-LOW-01: Handle file receipt upload with size and magic byte verification
  let resolvedSlipUrl: string | null = slipUrl ?? null;

  if (
    rawSlipFile &&
    typeof rawSlipFile === "object" &&
    "size" in rawSlipFile &&
    (rawSlipFile as File).size > 0
  ) {
    const slipFile = rawSlipFile as File;
    const arrayBuf = await slipFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const validation = validatePaymentSlipBuffer(buffer, slipFile.type);
    if (!validation.valid) {
      return {
        success: false,
        data: null,
        error: validation.error ?? "Invalid receipt file",
      };
    }

    const ext =
      slipFile.type === "application/pdf"
        ? "pdf"
        : slipFile.type === "image/png"
        ? "png"
        : "jpg";
    const storagePath = `${context.tenantId}/${Date.now()}_slip.${ext}`;

    const { data: uploadData, error: uploadErr } = await adminClient.storage
      .from("payment_slips")
      .upload(storagePath, buffer, {
        contentType: slipFile.type,
        upsert: false,
      });

    if (uploadErr || !uploadData) {
      return {
        success: false,
        data: null,
        error: uploadErr?.message ?? "Failed to upload payment receipt",
      };
    }

    resolvedSlipUrl = uploadData.path;
  }

  // 1. Fetch Plan Details from database to guarantee pricing integrity
  const { data: plan, error: planErr } = await adminClient
    .from("subscription_plans")
    .select("id, code, price_lkr_monthly, price_lkr_annual")
    .eq("code", planCode)
    .single();

  if (planErr || !plan) {
    return {
      success: false,
      data: null,
      error: "Selected subscription plan does not exist",
    };
  }

  // Server-Side Price Binding (SEC-3B2C-LOW-01):
  // Client-submitted amountLkr is untrusted; derive strictly from server catalog price.
  const expectedAmountLkr =
    billingCycle === "annual" && plan.price_lkr_annual
      ? plan.price_lkr_annual
      : plan.price_lkr_monthly;

  // 2. Fetch current Tenant Subscription record
  const { data: currentSub, error: subErr } = await adminClient
    .from("tenant_subscriptions")
    .select("id, status, plan_id")
    .eq("tenant_id", context.tenantId)
    .single();

  if (subErr || !currentSub) {
    return {
      success: false,
      data: null,
      error: "No subscription record found for this workspace",
    };
  }

  // 3. Create Subscription Payment Record (status: 'pending') with server-bound price
  const { data: payment, error: payErr } = await adminClient
    .from("subscription_payments")
    .insert({
      tenant_id: context.tenantId,
      subscription_id: currentSub.id,
      plan_id: plan.id,
      amount_lkr: expectedAmountLkr,
      billing_cycle: billingCycle,
      payment_method: "bank_transfer",
      status: "pending",
      reference_number: referenceNumber,
      slip_url: resolvedSlipUrl,
      submitted_by: context.userId,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    return {
      success: false,
      data: null,
      error: payErr?.message ?? "Failed to submit payment details",
    };
  }

  // 4. Update Subscription status to 'pending_payment'
  const { error: updateErr } = await adminClient
    .from("tenant_subscriptions")
    .update({
      status: "pending_payment",
      plan_id: plan.id,
      billing_cycle: billingCycle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", currentSub.id);

  if (updateErr) {
    return {
      success: false,
      data: null,
      error: "Failed to update subscription status",
    };
  }

  // 5. Audit Log in subscription_history
  await adminClient.from("subscription_history").insert({
    tenant_id: context.tenantId,
    event_type: "plan_changed",
    old_status: currentSub.status,
    new_status: "pending_payment",
    old_plan_id: currentSub.plan_id,
    new_plan_id: plan.id,
    actor_id: context.userId,
    notes: `Manual bank payment submitted (Ref: ${referenceNumber}, Amount: LKR ${expectedAmountLkr})`,
  });

  revalidatePath("/dashboard/subscription");
  return {
    success: true,
    data: { paymentId: payment.id },
    error: null,
  };
}

/**
 * Platform Administrator action to verify or reject a manual bank transfer payment.
 * Invokes the atomic PostgreSQL stored procedure public.admin_verify_subscription_payment()
 * to guarantee ACID consistency and row-level locking (SEC-3B2C2-LOW-03).
 * On approval: sets status 'active' and begins subscription period from verification time.
 * On rejection: leaves subscription 'expired'.
 */
export async function adminVerifyPayment(
  paymentId: string,
  approve: boolean,
  rejectionReason?: string,
  extensionDays?: number
): Promise<ActionResult<{ status: "verified" | "rejected" }>> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      data: null,
      error: "Platform administrator authentication required",
    };
  }

  // Execute atomic PostgreSQL procedure with row-level locks (SEC-3B2C2-LOW-03)
  const { error: rpcErr } = await supabase.rpc("admin_verify_subscription_payment", {
    p_payment_id: paymentId,
    p_approve: approve,
    p_rejection_reason: rejectionReason ?? null,
    p_extension_days: extensionDays ?? null,
  });

  if (rpcErr) {
    return {
      success: false,
      data: null,
      error: rpcErr.message || "Failed to process payment verification",
    };
  }

  revalidatePath("/dashboard/subscription");
  return {
    success: true,
    data: { status: approve ? "verified" : "rejected" },
    error: null,
  };
}
