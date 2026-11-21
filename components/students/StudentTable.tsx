// components/students/StudentTable.tsx
// Displays enrolled students with status badges and quick administrative actions.

"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { toggleStudentActive, unenrollStudentFromBatch } from "@/actions/students";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCheck, UserX, Trash2, Edit2, Phone } from "lucide-react";
import type { Profile } from "@/types";

interface StudentTableProps {
  batchId: string;
  students: Array<
    Profile & {
      enrollment_date?: string;
    }
  >;
}

export function StudentTable({ batchId, students }: StudentTableProps) {
  const [isPending, startTransition] = useTransition();

  const handleToggle = (studentId: string, currentStatus: boolean) => {
    startTransition(async () => {
      await toggleStudentActive(studentId, currentStatus, batchId);
    });
  };

  const handleUnenroll = (studentId: string, name: string) => {
    if (confirm(`Remove ${name} from this batch?`)) {
      startTransition(async () => {
        await unenrollStudentFromBatch(studentId, batchId);
      });
    }
  };

  if (students.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground space-y-3">
        <p className="text-sm">No students enrolled in this batch yet.</p>
        <Link
          href={`/dashboard/batches/${batchId}/students/new`}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add First Student
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 sm:px-6">Student</th>
              <th className="hidden px-4 py-3 sm:table-cell">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((student) => (
              <tr key={student.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 sm:px-6">
                  <div className="font-medium text-foreground">{student.full_name}</div>
                  <div className="text-xs text-muted-foreground sm:hidden">
                    {student.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {student.phone}
                      </span>
                    ) : (
                      "No phone"
                    )}
                  </div>
                </td>

                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {student.phone ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {student.phone}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">—</span>
                  )}
                </td>

                <td className="px-4 py-3">
                  {student.is_active ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[11px]">
                      Deactivated
                    </Badge>
                  )}
                </td>

                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* Toggle Active Status */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleToggle(student.id, student.is_active)}
                      className="h-8 px-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
                      title={student.is_active ? "Deactivate student" : "Activate student"}
                    >
                      {student.is_active ? (
                        <UserX className="h-4 w-4 text-amber-600" />
                      ) : (
                        <UserCheck className="h-4 w-4 text-emerald-600" />
                      )}
                      <span className="sr-only">
                        {student.is_active ? "Deactivate" : "Activate"}
                      </span>
                    </Button>

                    {/* Edit Student */}
                    <Link
                      href={`/dashboard/batches/${batchId}/students/${student.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit student"
                    >
                      <Edit2 className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Link>

                    {/* Unenroll from this batch */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleUnenroll(student.id, student.full_name)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      title="Remove from batch"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove from batch</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
