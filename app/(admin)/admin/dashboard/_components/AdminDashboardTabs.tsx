// app/(admin)/admin/dashboard/_components/AdminDashboardTabs.tsx
// Comprehensive platform administration dashboard component with reactive tabs and action modals.

"use client";

import React, { useState, useTransition } from "react";
import {
  AdminMetrics,
  AdminTeacherApplication,
  AdminWorkspaceItem,
  AdminPaymentSlipItem,
  AdminSubscriptionPlanItem,
  AdminAuditLogItem,
  approveTeacherApplicationAction,
  rejectTeacherApplicationAction,
  toggleWorkspaceActiveAction,
  verifyPaymentSlipAction,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CreditCard,
  Settings,
  History,
  Search,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
} from "lucide-react";

interface AdminDashboardTabsProps {
  initialMetrics: AdminMetrics | null;
  initialApplications: AdminTeacherApplication[];
  initialWorkspaces: AdminWorkspaceItem[];
  initialPayments: AdminPaymentSlipItem[];
  initialSettings: AdminSubscriptionPlanItem[];
  initialAuditLogs: AdminAuditLogItem[];
}

export function AdminDashboardTabs({
  initialMetrics,
  initialApplications,
  initialWorkspaces,
  initialPayments,
  initialSettings,
  initialAuditLogs,
}: AdminDashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "applications" | "teachers" | "subscriptions" | "payments" | "settings" | "audit"
  >("overview");

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Application Review Modal / Action State
  const [selectedApp, setSelectedApp] = useState<AdminTeacherApplication | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [verificationMode, setVerificationMode] = useState<string>("phone_call");
  const [verifiedPhone, setVerifiedPhone] = useState<string>("");
  const [reviewNotes, setReviewNotes] = useState<string>("");

  // Payment Verification Modal / Action State
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentSlipItem | null>(null);
  const [paymentAction, setPaymentAction] = useState<"approve" | "reject" | null>(null);
  const [paymentRejectReason, setPaymentRejectReason] = useState<string>("");

  // Filters
  const [appFilter, setAppFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const handleOpenAppModal = (app: AdminTeacherApplication, mode: "approve" | "reject") => {
    setSelectedApp(app);
    setActionType(mode);
    setVerificationMode("phone_call");
    setVerifiedPhone(app.phoneNumber || "");
    setReviewNotes("");
    setFeedback(null);
  };

  const handleCloseModal = () => {
    setSelectedApp(null);
    setActionType(null);
    setSelectedPayment(null);
    setPaymentAction(null);
  };

  const handleApproveApp = () => {
    if (!selectedApp) return;
    setFeedback(null);

    const formData = new FormData();
    formData.append("applicationId", selectedApp.id);
    formData.append("verificationMode", verificationMode);
    formData.append("verifiedPhone", verifiedPhone);
    formData.append("reviewNotes", reviewNotes);

    startTransition(async () => {
      const res = await approveTeacherApplicationAction(null, formData);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Application approved! Workspace '${res.data?.workspaceSlug}' provisioned with a 72-hour trial.`,
        });
        handleCloseModal();
      } else {
        setFeedback({ type: "error", message: res.error || "Approval failed." });
      }
    });
  };

  const handleRejectApp = () => {
    if (!selectedApp) return;
    setFeedback(null);

    const formData = new FormData();
    formData.append("applicationId", selectedApp.id);
    formData.append("reviewNotes", reviewNotes);

    startTransition(async () => {
      const res = await rejectTeacherApplicationAction(null, formData);
      if (res.success) {
        setFeedback({ type: "success", message: "Application rejected." });
        handleCloseModal();
      } else {
        setFeedback({ type: "error", message: res.error || "Rejection failed." });
      }
    });
  };

  const handleToggleWorkspace = (tenantId: string, currentActive: boolean) => {
    setFeedback(null);
    const formData = new FormData();
    formData.append("tenantId", tenantId);
    formData.append("isActive", currentActive ? "false" : "true");

    startTransition(async () => {
      const res = await toggleWorkspaceActiveAction(null, formData);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Workspace status updated to ${!currentActive ? "Active" : "Suspended"}.`,
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to toggle status." });
      }
    });
  };

  const handleProcessPayment = (payment: AdminPaymentSlipItem, approve: boolean) => {
    setSelectedPayment(payment);
    setPaymentAction(approve ? "approve" : "reject");
  };

  const handleConfirmPayment = () => {
    if (!selectedPayment || !paymentAction) return;
    setFeedback(null);

    const formData = new FormData();
    formData.append("paymentId", selectedPayment.id);
    formData.append("approve", paymentAction === "approve" ? "true" : "false");
    if (paymentAction === "reject") {
      formData.append("rejectionReason", paymentRejectReason);
    }

    startTransition(async () => {
      const res = await verifyPaymentSlipAction(null, formData);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Payment ${paymentAction === "approve" ? "approved and subscription extended" : "rejected"}.`,
        });
        handleCloseModal();
      } else {
        setFeedback({ type: "error", message: res.error || "Payment verification failed." });
      }
    });
  };

  const filteredApplications = initialApplications.filter((app) => {
    if (appFilter !== "all" && app.status !== appFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        app.fullName.toLowerCase().includes(q) ||
        app.email.toLowerCase().includes(q) ||
        app.instituteName.toLowerCase().includes(q) ||
        app.workspaceSlug.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredWorkspaces = initialWorkspaces.filter((w) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        w.slug.toLowerCase().includes(q) ||
        w.ownerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Global Feedback Banner */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-xs font-semibold ${
            feedback.type === "success"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] underline cursor-pointer hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab("applications")}
          className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "applications"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Applications</span>
          {initialMetrics?.pendingApplications ? (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {initialMetrics.pendingApplications}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveTab("teachers")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "teachers"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Workspaces</span>
        </button>

        <button
          onClick={() => setActiveTab("subscriptions")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "subscriptions"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Subscriptions</span>
        </button>

        <button
          onClick={() => setActiveTab("payments")}
          className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "payments"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span>Bank Payments</span>
          {initialMetrics?.pendingPayments ? (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {initialMetrics.pendingPayments}
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "settings"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Catalog & Quotas</span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            activeTab === "audit"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* ──────────────── TAB: OVERVIEW ──────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Tuition Teachers</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-3xl font-black text-foreground">
                {initialMetrics?.totalTeachers ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Verified instructor profiles
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Pending Applications</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-3 text-3xl font-black text-amber-600 dark:text-amber-400">
                {initialMetrics?.pendingApplications ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Awaiting manual identity review
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Active Students</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-3xl font-black text-foreground">
                {initialMetrics?.activeStudents ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enrolled across all tuition workspaces
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Active Subscriptions</span>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-3xl font-black text-foreground">
                {initialMetrics?.activeSubscriptions ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Paid and trial tenancies
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Pending Bank Slips</span>
                <CreditCard className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-3 text-3xl font-black text-amber-600 dark:text-amber-400">
                {initialMetrics?.pendingPayments ?? 0}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Bank transfer proofs awaiting verification
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">Monthly MRR</span>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 text-3xl font-black text-foreground">
                LKR {(initialMetrics?.totalMonthlyRevenueLkr ?? 0).toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                From active paid subscription tiers
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB: APPLICATIONS ──────────────── */}
      {activeTab === "applications" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Filter:</span>
              {(["all", "pending", "approved", "rejected"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setAppFilter(status)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                    appFilter === status
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search applicants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/80 bg-muted/40 text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Applicant</th>
                    <th className="px-4 py-3">Tuition Institute</th>
                    <th className="px-4 py-3">Workspace Slug</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Applied</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredApplications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No teacher applications found.
                      </td>
                    </tr>
                  ) : (
                    filteredApplications.map((app) => (
                      <tr key={app.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground">{app.fullName}</div>
                          <div className="text-[11px] text-muted-foreground">{app.email}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">{app.instituteName}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                          {app.workspaceSlug}
                        </td>
                        <td className="px-4 py-3">{app.phoneNumber || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              app.status === "approved"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : app.status === "rejected"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {app.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(app.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {app.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAppModal(app, "approve")}
                                className="h-7 rounded-lg text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
                              >
                                Review & Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAppModal(app, "reject")}
                                className="h-7 rounded-lg text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {app.reviewNotes ? `Notes: ${app.reviewNotes}` : "Reviewed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB: WORKSPACES ──────────────── */}
      {activeTab === "teachers" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search workspaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/80 bg-muted/40 text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Tuition Workspace</th>
                    <th className="px-4 py-3">Owner / Teacher</th>
                    <th className="px-4 py-3">Students</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Access Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredWorkspaces.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No tuition workspaces found.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkspaces.map((w) => (
                      <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground">{w.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{w.slug}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">{w.ownerName}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-foreground">{w.studentCount}</span> active
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-bold uppercase">
                            {w.subscriptionPlan}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              w.isActive
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {w.isActive ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(w.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleToggleWorkspace(w.id, w.isActive)}
                            className={`h-7 rounded-lg text-xs font-bold gap-1 ${
                              w.isActive
                                ? "text-amber-600 hover:bg-amber-500/10"
                                : "text-emerald-600 hover:bg-emerald-500/10"
                            }`}
                          >
                            {w.isActive ? (
                              <>
                                <ToggleRight className="h-3.5 w-3.5" />
                                <span>Suspend</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-3.5 w-3.5" />
                                <span>Activate</span>
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB: SUBSCRIPTIONS ──────────────── */}
      {activeTab === "subscriptions" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs">
            <h3 className="font-bold text-primary flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" />
              <span>SaaS Subscription Lifecycle</span>
            </h3>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              New approved teachers receive an atomic 72-hour introductory trial. Subscriptions transition to paid active status when manual bank deposit slips are verified by platform administrators.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/80 bg-muted/40 text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Workspace</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Current Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trial Expiry</th>
                    <th className="px-4 py-3">Period End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {initialWorkspaces.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-bold">{w.name}</td>
                      <td className="px-4 py-3">{w.ownerName}</td>
                      <td className="px-4 py-3 font-semibold">{w.subscriptionPlan}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            w.subscriptionStatus === "active"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {w.subscriptionStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {w.trialEndsAt ? new Date(w.trialEndsAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {w.currentPeriodEnd ? new Date(w.currentPeriodEnd).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB: BANK PAYMENTS ──────────────── */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/80 bg-muted/40 text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Tuition Workspace</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reference / Slip</th>
                    <th className="px-4 py-3">Submitted By</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {initialPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No bank payment slips found.
                      </td>
                    </tr>
                  ) : (
                    initialPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-bold">{p.tenantName}</td>
                        <td className="px-4 py-3">{p.planName}</td>
                        <td className="px-4 py-3 font-bold">LKR {p.amountLkr.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {p.referenceNumber || "No reference"}
                          </div>
                          {p.signedSlipUrl ? (
                            <a
                              href={p.signedSlipUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline mt-0.5 text-[11px]"
                            >
                              <span>View Bank Slip</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No slip uploaded</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.submittedByEmail}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              p.status === "verified"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : p.status === "rejected"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleProcessPayment(p, true)}
                                className="h-7 rounded-lg text-xs font-bold text-emerald-600 hover:bg-emerald-600 hover:text-white"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleProcessPayment(p, false)}
                                className="h-7 rounded-lg text-xs font-bold text-destructive hover:bg-destructive hover:text-white"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {p.notes || "Completed"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB: SETTINGS & QUOTAS ──────────────── */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Provisional Quota Disclaimer Banner */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="h-4 w-4" />
              <span>Provisional Student Quotas Notice</span>
            </div>
            <p className="leading-relaxed">
              The student quota limits displayed below (Starter: 30, Growth: 100, Pro: 300) are temporary technical system ceilings and have not been commercially finalized. They must not be advertised to prospective tuition instructors as fixed commercial entitlements. Monthly pricing (LKR 2,600 / 5,000 / 8,000) is officially approved.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {initialSettings.map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-lg text-foreground">{plan.name}</h3>
                  <span className="font-mono text-xs uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground">
                    {plan.code}
                  </span>
                </div>
                <div className="text-2xl font-black text-primary">
                  LKR {plan.priceLkrMonthly.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground"> / month</span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
                <div className="pt-2 border-t border-border/60 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provisional Student Ceiling:</span>
                    <span className="font-bold">{plan.maxStudents} students</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cloud Storage:</span>
                    <span className="font-bold">
                      {(plan.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(0)} GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────── TAB: AUDIT LOGS ──────────────── */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/80 bg-muted/40 text-[11px] font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Tuition Workspace</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3">Operator</th>
                    <th className="px-4 py-3">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {initialAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    initialAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold">{log.tenantName}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-[11px]">
                            {log.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{log.actorEmail}</td>
                        <td className="px-4 py-3 text-muted-foreground">{log.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: APPLICATION REVIEW (APPROVE / REJECT) ──────────────── */}
      {selectedApp && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                {actionType === "approve" ? (
                  <>
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span>Approve Teacher Application</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span>Reject Teacher Application</span>
                  </>
                )}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Applicant Details Recap */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Instructor: </span>
                <span className="font-bold text-foreground">{selectedApp.fullName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email: </span>
                <span className="font-medium text-foreground">{selectedApp.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Academy: </span>
                <span className="font-medium text-foreground">{selectedApp.instituteName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Workspace Code: </span>
                <span className="font-mono text-foreground">{selectedApp.workspaceSlug}</span>
              </div>
            </div>

            {actionType === "approve" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="verificationMode" className="text-xs font-semibold">
                    Identity Verification Method
                  </Label>
                  <select
                    id="verificationMode"
                    value={verificationMode}
                    onChange={(e) => setVerificationMode(e.target.value)}
                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs"
                  >
                    <option value="phone_call">Direct Phone Call & Oral Verification</option>
                    <option value="in_person">In-Person Verification</option>
                    <option value="institutional_credentials">Institutional Credentials / NIC / Staff ID</option>
                    <option value="pre_verified_test">Pre-Verified Staging Test Account</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="verifiedPhone" className="text-xs font-semibold">
                    Verified Contact Phone Number
                  </Label>
                  <Input
                    id="verifiedPhone"
                    value={verifiedPhone}
                    onChange={(e) => setVerifiedPhone(e.target.value)}
                    placeholder="+94 77 123 4567"
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reviewNotes" className="text-xs font-semibold">
                    Review / Audit Notes (Optional)
                  </Label>
                  <Input
                    id="reviewNotes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="e.g. Identity verified via telephone. NIC confirmed."
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground leading-relaxed">
                  Approving this application will execute atomic stored procedure <code className="text-foreground">admin_approve_teacher_application</code>, creating a tuition tenant, owner membership, trial claim, and starting an exact 72-hour trial.
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                    className="flex-1 h-10 text-xs rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={handleApproveApp}
                    className="flex-1 h-10 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirm & Provision Trial"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rejectNotes" className="text-xs font-semibold">
                    Rejection Reason / Notes
                  </Label>
                  <Input
                    id="rejectNotes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="e.g. Applicant did not answer verification call."
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                    className="flex-1 h-10 text-xs rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={handleRejectApp}
                    className="flex-1 h-10 text-xs font-bold rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirm Rejection"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: PAYMENT VERIFICATION ──────────────── */}
      {selectedPayment && paymentAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                {paymentAction === "approve" ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>Approve Bank Transfer Proof</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span>Reject Payment Deposit Slip</span>
                  </>
                )}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Workspace: </span>
                <span className="font-bold text-foreground">{selectedPayment.tenantName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Amount: </span>
                <span className="font-bold text-primary">
                  LKR {selectedPayment.amountLkr.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Plan: </span>
                <span className="font-medium text-foreground">{selectedPayment.planName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Reference: </span>
                <span className="font-mono text-foreground">
                  {selectedPayment.referenceNumber || "None"}
                </span>
              </div>
            </div>

            {paymentAction === "approve" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Approving this payment will transition the workspace subscription to <strong className="text-foreground">active</strong> status and extend validity by 30 days.
                </p>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                    className="flex-1 h-10 text-xs rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={handleConfirmPayment}
                    className="flex-1 h-10 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Approve & Activate"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentRejectReason" className="text-xs font-semibold">
                    Rejection Reason
                  </Label>
                  <Input
                    id="paymentRejectReason"
                    value={paymentRejectReason}
                    onChange={(e) => setPaymentRejectReason(e.target.value)}
                    placeholder="e.g. Unclear receipt image or amount mismatch."
                    className="h-10 text-xs rounded-xl"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                    className="flex-1 h-10 text-xs rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={handleConfirmPayment}
                    className="flex-1 h-10 text-xs font-bold rounded-xl bg-destructive text-white hover:bg-destructive/90"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Confirm Rejection"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
