// app/(teacher)/dashboard/batches/[batchId]/students/[studentId]/page.tsx
// Page to view and edit student profile details, active status, and batch enrollments.

import React from "react";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
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
  const supabase = await createServerClient();
  const { data: student } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", studentId)
    .single();

  return {
    title: student ? `${student.full_name} — Edvora` : "Student Details — Edvora",
  };
}

export default async function StudentDetailPage({
  params,
}: StudentDetailPageProps) {
  const { batchId, studentId } = await params;
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

  const student: Profile = studentData;

  // 2. Fetch student's current enrollments
  const { data: enrollmentsData } = await supabase
    .from("enrollments")
    .select("batch_id")
    .eq("student_id", studentId);

  // 3. Fetch all batches to populate multi-batch selection
  const { data: allBatchesData } = await supabase
    .from("batches")
    .select("*")
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
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
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
