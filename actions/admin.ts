// actions/admin.ts
// Privileged Server Actions for Edvora Platform Super-Administrators.
// Strictly checks platform administrator authorization on every invocation.

"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServerAdminClient } from "@/lib/supabase/server";
import {
  approveApplicationSchema,
  rejectApplicationSchema,
  toggleWorkspaceSchema,
  verifyPaymentSlipSchema,
} from "@/lib/validators/admin";
import type { ActionResult } from "@/types";

export interface AdminMetrics {
  totalTeachers: number;
  pendingApplications: number;
  activeStudents: number;
  activeSubscriptions: number;
  pendingPayments: number;
  totalMonthlyRevenueLkr: number;
}

export interface AdminTeacherApplication {
  id: string;
  userId: string | null;
  email: string;
  canonicalEmail: string;
  fullName: string;
  phoneNumber: string | null;
  instituteName: string;
  workspaceSlug: string;
  status: "pending" | "approved" | "rejected";
  verificationMethod: string | null;
  verifiedPhone: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  tenantId: string | null;
  createdAt: string;
}

export interface AdminWorkspaceItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  ownerName: string;
  ownerEmail: string;
  studentCount: number;
  subscriptionPlan: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export interface AdminPaymentSlipItem {
  id: string;
  tenantId: string;
  tenantName: string;
  planName: string;
  amountLkr: number;
  billingCycle: string;
  status: string;
  referenceNumber: string | null;
  slipUrl: string | null;
  signedSlipUrl: string | null;
  submittedByEmail: string;
  createdAt: string;
  notes: string | null;
}

export interface AdminSubscriptionPlanItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceLkrMonthly: number;
  priceLkrAnnual: number | null;
  maxStudents: number;
  maxStorageBytes: number;
  isActive: boolean;
}

export interface AdminAuditLogItem {
  id: string;
  tenantId?: string;
  tenantName?: string;
  eventType: string;
  actorEmail?: string;
  notes: string | null;
  createdAt: string;
}

/**
 * Asserts the current caller is an authenticated, active platform super-administrator.
 * Fails closed if user is unauthenticated or not registered in public.platform_admins.
 */
async function assertPlatformAdmin(): Promise<{ adminUserId: string }> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: Platform administrator session required");
  }

  const adminClient = createServerAdminClient();
  const { data: adminRecord, error: adminErr } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminErr || !adminRecord) {
    throw new Error("Forbidden: Caller is not a platform administrator");
  }

  return { adminUserId: user.id };
}

/**
 * Retrieves high-level platform telemetry metrics.
 */
export async function getAdminOverviewMetrics(): Promise<ActionResult<AdminMetrics>> {
  try {
    await assertPlatformAdmin();
    const adminClient = createServerAdminClient();

    const [
      { count: teacherCount },
      { count: pendingAppCount },
      { count: studentCount },
      { data: activeSubs },
      { count: pendingPayCount },
    ] = await Promise.all([
      adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
      adminClient.from("teacher_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
      adminClient
        .from("tenant_subscriptions")
        .select("plan_id, status, subscription_plans(price_lkr_monthly)")
        .in("status", ["active", "trialing"]),
      adminClient.from("subscription_payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    let totalRevenue = 0;
    if (activeSubs) {
      for (const sub of activeSubs) {
        if (sub.status === "active" && sub.subscription_plans) {
          const plan = Array.isArray(sub.subscription_plans)
            ? sub.subscription_plans[0]
            : sub.subscription_plans;
          if (plan && typeof plan.price_lkr_monthly === "number") {
            totalRevenue += plan.price_lkr_monthly;
          }
        }
      }
    }

    return {
      success: true,
      data: {
        totalTeachers: teacherCount ?? 0,
        pendingApplications: pendingAppCount ?? 0,
        activeStudents: studentCount ?? 0,
        activeSubscriptions: activeSubs?.length ?? 0,
        pendingPayments: pendingPayCount ?? 0,
        totalMonthlyRevenueLkr: totalRevenue,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to load metrics",
    };
  }
}

/**
 * Retrieves teacher applications with optional status filter.
 */
export async function getTeacherApplications(
  statusFilter?: "pending" | "approved" | "rejected"
): Promise<ActionResult<AdminTeacherApplication[]>> {
  try {
    await assertPlatformAdmin();
    const adminClient = createServerAdminClient();

    let query = adminClient
      .from("teacher_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    const formatted: AdminTeacherApplication[] = (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      canonicalEmail: row.canonical_email,
      fullName: row.full_name,
      phoneNumber: row.phone_number,
      instituteName: row.institute_name,
      workspaceSlug: row.workspace_slug,
      status: row.status as "pending" | "approved" | "rejected",
      verificationMethod: row.verification_method,
      verifiedPhone: row.verified_phone,
      reviewNotes: row.review_notes,
      reviewedAt: row.reviewed_at,
      tenantId: row.tenant_id,
      createdAt: row.created_at,
    }));

    return { success: true, data: formatted, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch teacher applications",
    };
  }
}

/**
 * Approves a pending teacher application and executes atomic workspace & trial provisioning.
 */
export async function approveTeacherApplicationAction(
  _prevState: ActionResult<{ tenantId: string; workspaceSlug: string }> | null,
  formData: FormData
): Promise<ActionResult<{ tenantId: string; workspaceSlug: string }>> {
  try {
    await assertPlatformAdmin();

    const rawApplicationId = formData.get("applicationId");
    const rawVerificationMode = formData.get("verificationMode");
    const rawVerifiedPhone = formData.get("verifiedPhone");
    const rawReviewNotes = formData.get("reviewNotes");

    const parseResult = approveApplicationSchema.safeParse({
      applicationId: typeof rawApplicationId === "string" ? rawApplicationId : "",
      verificationMode: typeof rawVerificationMode === "string" ? rawVerificationMode : "phone_call",
      verifiedPhone: typeof rawVerifiedPhone === "string" ? rawVerifiedPhone : "",
      reviewNotes: typeof rawReviewNotes === "string" ? rawReviewNotes : "",
    });

    if (!parseResult.success) {
      return {
        success: false,
        data: null,
        error: parseResult.error.issues[0]?.message ?? "Invalid approval parameters",
      };
    }

    const { applicationId, verificationMode, verifiedPhone, reviewNotes } = parseResult.data;
    const supabase = await createServerClient();

    // Call atomic PostgreSQL stored procedure public.admin_approve_teacher_application()
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "admin_approve_teacher_application",
      {
        p_application_id: applicationId,
        p_verification_mode: verificationMode,
        p_verified_phone: verifiedPhone,
        p_review_notes: reviewNotes || null,
      }
    );

    if (rpcErr) {
      return {
        success: false,
        data: null,
        error: rpcErr.message || "Failed to approve application",
      };
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    revalidatePath("/admin/dashboard");

    return {
      success: true,
      data: {
        tenantId: result?.tenant_id,
        workspaceSlug: result?.workspace_slug,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "An unexpected error occurred during approval",
    };
  }
}

/**
 * Rejects a pending teacher application with review notes.
 */
export async function rejectTeacherApplicationAction(
  _prevState: ActionResult<{ success: boolean }> | null,
  formData: FormData
): Promise<ActionResult<{ success: boolean }>> {
  try {
    await assertPlatformAdmin();

    const rawApplicationId = formData.get("applicationId");
    const rawReviewNotes = formData.get("reviewNotes");

    const parseResult = rejectApplicationSchema.safeParse({
      applicationId: typeof rawApplicationId === "string" ? rawApplicationId : "",
      reviewNotes: typeof rawReviewNotes === "string" ? rawReviewNotes : "",
    });

    if (!parseResult.success) {
      return {
        success: false,
        data: null,
        error: parseResult.error.issues[0]?.message ?? "Invalid rejection parameters",
      };
    }

    const { applicationId, reviewNotes } = parseResult.data;
    const supabase = await createServerClient();

    const { error: rpcErr } = await supabase.rpc("admin_reject_teacher_application", {
      p_application_id: applicationId,
      p_review_notes: reviewNotes,
    });

    if (rpcErr) {
      return {
        success: false,
        data: null,
        error: rpcErr.message || "Failed to reject application",
      };
    }

    revalidatePath("/admin/dashboard");
    return { success: true, data: { success: true }, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "An unexpected error occurred during rejection",
    };
  }
}

/**
 * Retrieves the full workspaces directory with subscription and student counts.
 */
export async function getWorkspacesList(): Promise<ActionResult<AdminWorkspaceItem[]>> {
  try {
    await assertPlatformAdmin();
    const adminClient = createServerAdminClient();

    const { data: tenants, error: tErr } = await adminClient
      .from("tenants")
      .select(`
        id,
        name,
        slug,
        is_active,
        created_at,
        owner_id,
        profiles!tenants_owner_id_fkey(full_name),
        tenant_subscriptions(
          status,
          trial_ends_at,
          current_period_end,
          subscription_plans(name)
        )
      `)
      .order("created_at", { ascending: false });

    if (tErr) throw tErr;

    // Get student counts per tenant
    const { data: enrollments } = await adminClient
      .from("enrollments")
      .select("tenant_id, student_id");

    const countMap = new Map<string, Set<string>>();
    if (enrollments) {
      for (const e of enrollments) {
        if (!countMap.has(e.tenant_id)) {
          countMap.set(e.tenant_id, new Set());
        }
        countMap.get(e.tenant_id)?.add(e.student_id);
      }
    }

    const items: AdminWorkspaceItem[] = (tenants || []).map((t) => {
      const ownerProfile = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
      const sub = Array.isArray(t.tenant_subscriptions)
        ? t.tenant_subscriptions[0]
        : t.tenant_subscriptions;
      const plan = sub?.subscription_plans
        ? Array.isArray(sub.subscription_plans)
          ? sub.subscription_plans[0]
          : sub.subscription_plans
        : null;

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        isActive: t.is_active,
        ownerName: ownerProfile?.full_name || "Unknown Teacher",
        ownerEmail: "",
        studentCount: countMap.get(t.id)?.size || 0,
        subscriptionPlan: plan?.name || "Starter Tuition",
        subscriptionStatus: sub?.status || "trialing",
        trialEndsAt: sub?.trial_ends_at || null,
        currentPeriodEnd: sub?.current_period_end || null,
        createdAt: t.created_at,
      };
    });

    return { success: true, data: items, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch workspaces list",
    };
  }
}

/**
 * Toggles workspace active/suspended status.
 */
export async function toggleWorkspaceActiveAction(
  _prevState: ActionResult<{ success: boolean }> | null,
  formData: FormData
): Promise<ActionResult<{ success: boolean }>> {
  try {
    await assertPlatformAdmin();

    const rawTenantId = formData.get("tenantId");
    const rawIsActive = formData.get("isActive");

    const parseResult = toggleWorkspaceSchema.safeParse({
      tenantId: typeof rawTenantId === "string" ? rawTenantId : "",
      isActive: rawIsActive === "true" || rawIsActive === "1",
    });

    if (!parseResult.success) {
      return {
        success: false,
        data: null,
        error: parseResult.error.issues[0]?.message ?? "Invalid parameters",
      };
    }

    const { tenantId, isActive } = parseResult.data;
    const adminClient = createServerAdminClient();

    const { error: updErr } = await adminClient
      .from("tenants")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    if (updErr) throw updErr;

    revalidatePath("/admin/dashboard");
    return { success: true, data: { success: true }, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to toggle workspace status",
    };
  }
}

/**
 * Retrieves pending payment slips with signed preview URLs from private bucket 'payment_slips'.
 */
export async function getPendingPaymentSlips(): Promise<ActionResult<AdminPaymentSlipItem[]>> {
  try {
    await assertPlatformAdmin();
    const adminClient = createServerAdminClient();

    const { data: payments, error: pErr } = await adminClient
      .from("subscription_payments")
      .select(`
        id,
        tenant_id,
        amount_lkr,
        billing_cycle,
        status,
        reference_number,
        slip_url,
        notes,
        created_at,
        submitted_by,
        tenants(name),
        subscription_plans(name),
        profiles!subscription_payments_submitted_by_fkey(full_name)
      `)
      .order("created_at", { ascending: false });

    if (pErr) throw pErr;

    const items: AdminPaymentSlipItem[] = [];

    for (const p of payments || []) {
      let signedUrl: string | null = null;
      if (p.slip_url) {
        const { data: signedData } = await adminClient.storage
          .from("payment_slips")
          .createSignedUrl(p.slip_url, 60 * 60); // 1-hour secure link
        signedUrl = signedData?.signedUrl || null;
      }

      const tenant = Array.isArray(p.tenants) ? p.tenants[0] : p.tenants;
      const plan = Array.isArray(p.subscription_plans)
        ? p.subscription_plans[0]
        : p.subscription_plans;
      const submitter = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;

      items.push({
        id: p.id,
        tenantId: p.tenant_id,
        tenantName: tenant?.name || "Unknown Workspace",
        planName: plan?.name || "Starter Tuition",
        amountLkr: Number(p.amount_lkr),
        billingCycle: p.billing_cycle,
        status: p.status,
        referenceNumber: p.reference_number,
        slipUrl: p.slip_url,
        signedSlipUrl: signedUrl,
        submittedByEmail: submitter?.full_name || "Staff Member",
        createdAt: p.created_at,
        notes: p.notes,
      });
    }

    return { success: true, data: items, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch payment slips",
    };
  }
}

/**
 * Verifies or rejects a manual bank transfer deposit proof.
 */
export async function verifyPaymentSlipAction(
  _prevState: ActionResult<{ success: boolean }> | null,
  formData: FormData
): Promise<ActionResult<{ success: boolean }>> {
  try {
    await assertPlatformAdmin();

    const rawPaymentId = formData.get("paymentId");
    const rawApprove = formData.get("approve");
    const rawRejectionReason = formData.get("rejectionReason");
    const rawExtensionDays = formData.get("extensionDays");

    const parseResult = verifyPaymentSlipSchema.safeParse({
      paymentId: typeof rawPaymentId === "string" ? rawPaymentId : "",
      approve: rawApprove === "true" || rawApprove === "1",
      rejectionReason: typeof rawRejectionReason === "string" ? rawRejectionReason : undefined,
      extensionDays: rawExtensionDays ? Number(rawExtensionDays) : undefined,
    });

    if (!parseResult.success) {
      return {
        success: false,
        data: null,
        error: parseResult.error.issues[0]?.message ?? "Invalid verification parameters",
      };
    }

    const { paymentId, approve, rejectionReason, extensionDays } = parseResult.data;
    const supabase = await createServerClient();

    const { error: rpcErr } = await supabase.rpc("admin_verify_subscription_payment", {
      p_payment_id: paymentId,
      p_approve: approve,
      p_rejection_reason: rejectionReason || null,
      p_extension_days: extensionDays || null,
    });

    if (rpcErr) {
      return {
        success: false,
        data: null,
        error: rpcErr.message || "Failed to process payment verification",
      };
    }

    revalidatePath("/admin/dashboard");
    return { success: true, data: { success: true }, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to verify payment",
    };
  }
}

/**
 * Retrieves commercial settings and catalog pricing plans.
 */
export async function getCommercialSettings(): Promise<ActionResult<AdminSubscriptionPlanItem[]>> {
  try {
    await assertPlatformAdmin();
    const adminClient = createServerAdminClient();

    const { data, error } = await adminClient
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const items: AdminSubscriptionPlanItem[] = (data || []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      priceLkrMonthly: Number(row.price_lkr_monthly),
      priceLkrAnnual: row.price_lkr_annual ? Number(row.price_lkr_annual) : null,
      maxStudents: row.max_students,
      maxStorageBytes: row.max_storage_bytes,
      isActive: row.is_active,
    }));

    return { success: true, data: items, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch commercial settings",
    };
  }
}

/**
 * Retrieves recent audit history entries from subscription_history.
 */
export async function getAuditHistory(): Promise<ActionResult<AdminAuditLogItem[]>> {
  try {
    await assertPlatformAdmin();
    const adminClient = createServerAdminClient();

    const { data, error } = await adminClient
      .from("subscription_history")
      .select(`
        id,
        tenant_id,
        event_type,
        notes,
        created_at,
        tenants(name),
        profiles(full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const items: AdminAuditLogItem[] = (data || []).map((row) => {
      const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: tenant?.name || "Workspace",
        eventType: row.event_type,
        actorEmail: profile?.full_name || "System Admin",
        notes: row.notes,
        createdAt: row.created_at,
      };
    });

    return { success: true, data: items, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch audit history",
    };
  }
}
