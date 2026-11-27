// app/(teacher)/dashboard/subscription/_components/SubscriptionPaymentForm.tsx
// Interactive plan selection and manual bank transfer proof submission form.

"use client";

import React, { useState, useTransition } from "react";
import { submitSubscriptionPayment } from "@/actions/subscriptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import type { ActionResult } from "@/types";
import type { BankTransferConfig } from "@/lib/config/payment";

interface SubscriptionPaymentFormProps {
  currentPlanCode?: string;
  subscriptionStatus: string;
  bankDetails?: BankTransferConfig;
}

interface PlanOption {
  code: "starter" | "growth" | "pro";
  name: string;
  priceLkr: number;
  popular?: boolean;
  description: string;
}

const PLANS: PlanOption[] = [
  {
    code: "starter",
    name: "Starter Tuition",
    priceLkr: 2600,
    description: "Ideal for individual tuition teachers managing small cohorts.",
  },
  {
    code: "growth",
    name: "Growth Tuition",
    priceLkr: 5000,
    popular: true,
    description: "Designed for established tuition teachers with expanding batches.",
  },
  {
    code: "pro",
    name: "Professional Academy",
    priceLkr: 8000,
    description: "Comprehensive suite for tuition institutions and multi-batch academies.",
  },
];

export function SubscriptionPaymentForm({
  currentPlanCode = "starter",
  subscriptionStatus,
  bankDetails,
}: SubscriptionPaymentFormProps) {
  const [selectedPlanCode, setSelectedPlanCode] = useState<"starter" | "growth" | "pro">(
    (currentPlanCode as "starter" | "growth" | "pro") || "starter"
  );
  const billingCycle: "monthly" | "annual" = "monthly";
  const [referenceNumber, setReferenceNumber] = useState("");
  const [slipUrl, setSlipUrl] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedPlan = PLANS.find((p) => p.code === selectedPlanCode) || PLANS[0];
  const payableAmountLkr = selectedPlan.priceLkr;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("planCode", selectedPlanCode);
    formData.append("billingCycle", billingCycle);
    formData.append("amountLkr", String(payableAmountLkr));
    formData.append("referenceNumber", referenceNumber);
    formData.append("slipUrl", slipUrl);
    formData.append("notes", notes);
    if (slipFile) {
      formData.append("slipFile", slipFile);
    }

    startTransition(async () => {
      const res: ActionResult<{ paymentId: string }> = await submitSubscriptionPayment(null, formData);
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error);
      }
    });
  };

  if (success || subscriptionStatus === "pending_payment") {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          Payment Submitted for Verification
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Your payment proof has been securely recorded with status <strong>Pending Payment</strong>. Platform administrators verify transfers within 2 to 4 business hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Plan Selection Grid ────────────────────────────────────────── */}
      <div>
        <Label className="text-xs font-bold text-foreground uppercase tracking-wide block mb-3">
          Select Subscription Plan
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlanCode === plan.code;
            return (
              <div
                key={plan.code}
                onClick={() => setSelectedPlanCode(plan.code)}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    Recommended
                  </span>
                )}
                <div>
                  <div className="text-sm font-bold text-foreground">{plan.name}</div>
                  <div className="mt-1 text-2xl font-black text-foreground">
                    LKR {plan.priceLkr.toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground">/mo</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    {plan.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Verified Bank Details Card (Configurable from Server / Env - SEC-3B2C2-LOW-02) ── */}
      {bankDetails?.isConfigured ? (
        <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Building2 className="h-4 w-4 text-primary" />
            <span>Official Bank Transfer Instructions</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-xs">
            <div>
              <span className="text-muted-foreground">Bank:</span> {bankDetails.bankName}
            </div>
            {bankDetails.branch && (
              <div>
                <span className="text-muted-foreground">Branch:</span> {bankDetails.branch}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Account Name:</span> {bankDetails.accountName}
            </div>
            <div>
              <span className="text-muted-foreground">Account Number:</span> {bankDetails.accountNumber}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            * Please deposit exactly <strong>LKR {payableAmountLkr.toLocaleString()}</strong>.{" "}
            {bankDetails.instructions}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Direct Bank Transfer Currently Unavailable</span>
          </div>
          <p className="leading-relaxed">
            Corporate banking coordinates are currently being configured by platform administrators.
            Manual payment submission is temporarily paused. Please contact platform support.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{error}</span>
        </div>
      )}

      {/* ── Payment Proof Inputs ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="referenceNumber" className="text-xs font-semibold text-foreground">
            Bank Transaction / Slip Reference *
          </Label>
          <Input
            id="referenceNumber"
            required
            placeholder="e.g. TXN-9842104 / Ref# 4819"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            disabled={isPending}
            className="h-10 rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slipFile" className="text-xs font-semibold text-foreground">
            Upload Deposit Receipt (PDF, PNG, JPG — Max 5 MB)
          </Label>
          <Input
            id="slipFile"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
            disabled={isPending || !bankDetails?.isConfigured}
            className="h-10 rounded-xl cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slipUrl" className="text-xs font-semibold text-foreground">
            Slip Reference URL or Cloud Storage Link (Optional)
          </Label>
          <Input
            id="slipUrl"
            placeholder="https://drive.google.com/... or slip reference"
            value={slipUrl}
            onChange={(e) => setSlipUrl(e.target.value)}
            disabled={isPending || !bankDetails?.isConfigured}
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-xs font-semibold text-foreground">
          Additional Notes / Depositor Name (Optional)
        </Label>
        <Input
          id="notes"
          placeholder="e.g. Deposited from HNB account under Ruwan Perera"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isPending}
          className="h-10 rounded-xl"
        />
      </div>

      {/* ── Submit Action ──────────────────────────────────────────────── */}
      <Button
        type="submit"
        disabled={isPending || !bankDetails?.isConfigured}
        className="w-full sm:w-auto h-11 px-8 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Submitting Payment...</span>
          </>
        ) : !bankDetails?.isConfigured ? (
          <span>Payments Temporarily Paused</span>
        ) : (
          <>
            <span>Submit Payment (LKR {payableAmountLkr.toLocaleString()})</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
