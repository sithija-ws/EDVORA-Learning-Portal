// app/(teacher)/dashboard/batches/[batchId]/students/[studentId]/page.tsx
// Page to view and edit student profile details, active status, and batch enrollments.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireTenantContext, getTenantContext } from "@/lib/auth/tenant";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentForm } from "@/components/students/StudentForm";
import { Badge } from "@/components/ui/badge";
import type { Batch, Profile } from "@/types";

export const instant = false;

interface StudentDetailPageProps {
  params: Promise<{ batchId: string; studentId: string }>;
}

export async function generateMetadata({ params }: StudentDetailPageProps) {
  const { studentId } = await params;
  const tenantRes = await getTenantContext();
  if (tenantRes.status !== "resolved") {
    return { title: "Student Details — Edvora" };
  }
  const tenant = tenantRes.context;
  const supabase = await createServerClient();

  // Verify student belongs to this workspace via student_identities or enrollments
  const [{ data: identity }, { data: enrollment }] = await Promise.all([
    supabase
      .from("student_identities")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("batch_id")
      .eq("tenant_id", tenant.tenantId)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!identity && !enrollment) {
    return { title: "Student Details — Edvora" };
  }

  const { data: student } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", studentId)
    .maybeSingle();

  return {
    title: student ? `${student.full_name} — Edvora` : "Student Details — Edvora",
  };
}

export default async function StudentDetailPage({
  params,
}: StudentDetailPageProps) {
  const { batchId, studentId } = await params;
  const tenant = await requireTenantContext();
  const supabase = await createServerClient();

  // 1. Fetch student profile
  const { data: studentData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", studentId)
    .single();

  if (!studentData) {
    notFound();
  }

  // 2. Verify student belongs to this workspace via student_identities or enrollments
  const [{ data: identity }, { data: enrollmentsData }] = await Promise.all([
    supabase
      .from("student_identities")
      .select("id")
      .eq("tenant_id", tenant.tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("batch_id")
      .eq("tenant_id", tenant.tenantId)
      .eq("student_id", studentId),
  ]);

  if (!identity && (!enrollmentsData || enrollmentsData.length === 0)) {
    notFound();
  }

  const student: Profile = studentData;

  // 3. Fetch all batches for multi-batch assignment scoped to tenant
  const { data: allBatchesData } = await supabase
    .from("batches")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const allBatches: Batch[] = allBatchesData ?? [];

  return (
    <div>
      <PageHeader
        title={student.full_name}
        description="Manage profile information, account status, and batch enrollments."
        backHref={`/dashboard/batches/${batchId}`}
        badge={
          student.is_active ? (
            <Badge variant="outline" className="bg-primary/8 text-primary border-primary/30 text-xs">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-xs">
              Deactivated
            </Badge>
          )
        }
      />

      <div className="p-4 sm:p-6">
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-6">
          <StudentForm
            batches={allBatches}
            preSelectedBatchId={batchId}
            student={{
              ...student,
              enrollments: enrollmentsData ?? [],
            }}
          />
        </div>
      </div>
    </div>
  );
}
