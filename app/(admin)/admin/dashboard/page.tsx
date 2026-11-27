// app/(admin)/admin/dashboard/page.tsx
// Server component for Edvora Platform Super-Administration Dashboard.
// Authoritative check ensures only active platform administrators can load this page.

import type { Metadata } from "next";
import {
  getAdminOverviewMetrics,
  getTeacherApplications,
  getWorkspacesList,
  getPendingPaymentSlips,
  getCommercialSettings,
  getAuditHistory,
} from "@/actions/admin";
import { AdminDashboardTabs } from "./_components/AdminDashboardTabs";

export const instant = false;

export const metadata: Metadata = {
  title: "Platform Console – Edvora Central Operations",
  description: "Central management console for teacher onboarding, workspaces, billing, and system audits.",
};

export default async function AdminDashboardPage() {
  const [
    metricsRes,
    applicationsRes,
    workspacesRes,
    paymentsRes,
    settingsRes,
    auditRes,
  ] = await Promise.all([
    getAdminOverviewMetrics(),
    getTeacherApplications(),
    getWorkspacesList(),
    getPendingPaymentSlips(),
    getCommercialSettings(),
    getAuditHistory(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            Central Platform Operations
          </h1>
          <p className="text-xs text-muted-foreground">
            Teacher applicant onboarding, workspace lifecycle, bank deposit verification, and billing governance.
          </p>
        </div>
      </div>

      <AdminDashboardTabs
        initialMetrics={metricsRes.data}
        initialApplications={applicationsRes.data || []}
        initialWorkspaces={workspacesRes.data || []}
        initialPayments={paymentsRes.data || []}
        initialSettings={settingsRes.data || []}
        initialAuditLogs={auditRes.data || []}
      />
    </div>
  );
}
