// components/subscription/TrialBanner.tsx
// Displays contextual trial status, live countdown, or expiration alert in staff dashboard.

import React from "react";
import Link from "next/link";
import { Clock, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrialBannerProps {
  isTrial: boolean;
  trialEndsAt: string | null;
  trialRemainingSeconds: number;
  isSubscriptionActive: boolean;
  subscriptionStatus: string;
}

export function TrialBanner({
  isTrial,
  trialRemainingSeconds,
  isSubscriptionActive,
  subscriptionStatus,
}: TrialBannerProps) {
  // Active paid plan: no warning banner needed
  if (subscriptionStatus === "active" && !isTrial) {
    return null;
  }

  // Pending bank payment verification
  if (subscriptionStatus === "pending_payment") {
    return (
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-xs sm:text-sm text-blue-900 dark:text-blue-200">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>
            <strong>Payment Pending Verification:</strong> Your manual bank transfer receipt is being reviewed by our platform administrators.
          </span>
        </div>
        <Link href="/dashboard/subscription" className="shrink-0">
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-semibold border-blue-500/40 hover:bg-blue-500/20">
            View Details
          </Button>
        </Link>
      </div>
    );
  }

  // Active 72-hour trial in progress
  if (isTrial && isSubscriptionActive) {
    const hours = Math.floor(trialRemainingSeconds / 3600);
    const minutes = Math.floor((trialRemainingSeconds % 3600) / 60);

    return (
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
          <span>
            <strong>72-Hour Free Trial:</strong> You have{" "}
            <span className="font-mono font-bold">
              {hours}h {minutes}m
            </span>{" "}
            remaining to explore all features.
          </span>
        </div>
        <Link href="/dashboard/subscription" className="shrink-0">
          <Button size="sm" className="h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm">
            <span>Upgrade to Paid Plan</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    );
  }

  // Trial / subscription is expired
  if (!isSubscriptionActive) {
    return (
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-xs sm:text-sm text-destructive">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div>
            <strong className="block font-bold">Workspace Free Trial Expired</strong>
            <span className="text-xs text-muted-foreground">
              Content editing and student lesson access are restricted. Activate a monthly commercial subscription to resume full service.
            </span>
          </div>
        </div>
        <Link href="/dashboard/subscription" className="shrink-0">
          <Button size="sm" className="h-9 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-bold shadow-md">
            Activate Subscription
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
