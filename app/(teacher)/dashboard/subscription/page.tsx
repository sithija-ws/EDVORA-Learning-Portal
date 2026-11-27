// app/(teacher)/dashboard/subscription/page.tsx
// Teacher workspace subscription overview, commercial plans, and manual payment submissions.

import React from "react";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { requireTenantContext } from "@/lib/auth/tenant";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { SubscriptionPaymentForm } from "./_components/SubscriptionPaymentForm";
import { Badge } from "@/components/ui/badge";
import { getBankTransferDetails } from "@/lib/config/payment";

export const instant = false;

export const metadata = {
  title: "Subscription & Billing – Edvora",
};

export default async function SubscriptionPage() {
  const context = await requireTenantContext();
  const supabase = await createServerClient();
  const bankDetails = getBankTransferDetails();

  // Fetch recent payments for this tenant
  const { data: payments } = await supabase
    .from("subscription_payments")
    .select("id, amount_lkr, billing_cycle, payment_method, status, reference_number, rejection_reason, created_at, verified_at")
    .eq("tenant_id", context.tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Verified / Active</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pending Review</Badge>;
      case "rejected":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Subscription & Billing"
        description="Manage your workspace commercial tier and 72-hour trial."
        action={
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        }
      />

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
        {/* Trial / Expiry Banner */}
        <TrialBanner
          isTrial={context.isTrial}
          trialEndsAt={context.trialEndsAt}
          trialRemainingSeconds={context.trialRemainingSeconds}
          isSubscriptionActive={context.isSubscriptionActive}
          subscriptionStatus={context.subscriptionStatus}
        />

        {/* Current Subscription Status Card */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Workspace Status
              </span>
              <h2 className="text-xl font-bold text-foreground mt-0.5">
                {context.isTrial
                  ? "72-Hour Free Trial"
                  : context.subscriptionStatus === "active"
                  ? "Commercial Active Subscription"
                  : context.subscriptionStatus === "pending_payment"
                  ? "Pending Payment Verification"
                  : "Trial Expired"}
              </h2>
            </div>
            <div>
              {context.isSubscriptionActive ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold px-3 py-1">
                  Active Access
                </Badge>
              ) : (
                <Badge className="bg-destructive/15 text-destructive border-destructive/30 font-semibold px-3 py-1">
                  Access Restricted
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground block">Workspace:</span>
              <span className="font-semibold text-foreground">{context.tenantName}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Trial Expiry / Period End:</span>
              <span className="font-semibold text-foreground font-mono">
                {context.trialEndsAt
                  ? new Date(context.trialEndsAt).toLocaleString()
                  : context.currentPeriodEnd
                  ? new Date(context.currentPeriodEnd).toLocaleDateString()
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Role:</span>
              <span className="font-semibold text-foreground uppercase">{context.role}</span>
            </div>
          </div>
        </div>

        {/* Commercial Billing Form */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-foreground">
              Commercial Subscription Activation
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Select your monthly plan and submit your manual bank transfer deposit proof to activate or renew service.
            </p>
          </div>

          <SubscriptionPaymentForm
            subscriptionStatus={context.subscriptionStatus}
            bankDetails={bankDetails}
          />
        </div>

        {/* Recent Payment History */}
        {payments && payments.length > 0 && (
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-foreground">
                Payment History
              </h3>
            </div>

            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border text-xs">
              {payments.map((p) => (
                <div key={p.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-foreground">
                      LKR {Number(p.amount_lkr).toLocaleString()} ({p.billing_cycle})
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px]">
                      Ref: {p.reference_number || "N/A"} • Submitted: {new Date(p.created_at).toLocaleDateString()}
                    </div>
                    {p.rejection_reason && (
                      <div className="text-destructive text-[11px] mt-0.5">
                        Reason: {p.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div>{getStatusBadge(p.status)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
