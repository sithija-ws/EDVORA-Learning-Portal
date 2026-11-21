// components/students/StudentForm.tsx
// Client component for adding or editing a student account.

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createStudent, updateStudent } from "@/actions/students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import type { Batch, Profile } from "@/types";

interface StudentFormProps {
  batches: Batch[];
  preSelectedBatchId?: string;
  student?: Profile & { enrollments?: Array<{ batch_id: string }>; email?: string };
}

export function StudentForm({
  batches,
  preSelectedBatchId,
  student,
}: StudentFormProps) {
  const isEditing = Boolean(student);

  const initialSelected = student?.enrollments
    ? new Set(student.enrollments.map((e) => e.batch_id))
    : new Set(preSelectedBatchId ? [preSelectedBatchId] : []);

  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(initialSelected);

  const boundAction = isEditing
    ? updateStudent.bind(null, student!.id)
    : createStudent;

  const [state, formAction, isPending] = useActionState(boundAction, null);

  const toggleBatch = (batchId: string) => {
    setSelectedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const cancelHref = preSelectedBatchId
    ? `/dashboard/batches/${preSelectedBatchId}`
    : "/dashboard/batches";

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      {state?.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Full Name */}
      <div className="space-y-2">
        <Label htmlFor="full_name">
          Student Full Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={student?.full_name ?? ""}
          disabled={isPending}
          placeholder="e.g. Kumari Perera"
          className="h-10"
        />
      </div>

      {/* Username (Creation only) */}
      {!isEditing && (
        <div className="space-y-2">
          <Label htmlFor="username">
            Login Username <span className="text-destructive">*</span>
          </Label>
          <Input
            id="username"
            name="username"
            type="text"
            required
            disabled={isPending}
            placeholder="e.g. kumari-2027"
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, hyphens, and underscores only. The student will use this to sign in.
          </p>
        </div>
      )}

      {/* Password (Creation only) */}
      {!isEditing && (
        <div className="space-y-2">
          <Label htmlFor="password">
            Initial Password <span className="text-destructive">*</span>
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            disabled={isPending}
            placeholder="Minimum 8 characters"
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Provide this password to the student. They can sign in immediately.
          </p>
        </div>
      )}

      {/* Phone Number */}
      <div className="space-y-2">
        <Label htmlFor="phone">Phone / WhatsApp Number (Optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={student?.phone ?? ""}
          disabled={isPending}
          placeholder="e.g. 0771234567"
          className="h-10"
        />
      </div>

      {/* Batch Assignment (Many-to-Many) */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">
            Enrolled Batches <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Select one or more batches this student attends.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border p-3 max-h-52 overflow-y-auto bg-card">
          {batches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No batches available. Please create a batch first.
            </p>
          ) : (
            batches.map((b) => (
              <label
                key={b.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  name="batch_ids"
                  value={b.id}
                  checked={selectedBatches.has(b.id)}
                  onChange={() => toggleBatch(b.id)}
                  disabled={isPending}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <span className="font-medium text-foreground">{b.name}</span>
                <span className="text-xs text-muted-foreground">({b.year})</span>
                {b.is_archived && (
                  <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    Archived
                  </span>
                )}
              </label>
            ))
          )}
        </div>
      </div>

      {/* Active Status (Edit only) */}
      {isEditing && (
        <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/20">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={student?.is_active ?? true}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
          <div className="space-y-0.5">
            <Label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
              Active account
            </Label>
            <p className="text-xs text-muted-foreground">
              Uncheck to deactivate. Deactivated students are blocked from signing in.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending || selectedBatches.size === 0}
          className="cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEditing ? "Saving changes..." : "Adding student..."}
            </>
          ) : isEditing ? (
            "Save Changes"
          ) : (
            "Add Student"
          )}
        </Button>

        <Link
          href={cancelHref}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
