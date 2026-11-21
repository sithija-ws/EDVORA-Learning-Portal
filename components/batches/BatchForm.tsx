// components/batches/BatchForm.tsx
// Client component for creating or editing a batch.

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createBatch, updateBatch } from "@/actions/batches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2 } from "lucide-react";
import type { Batch } from "@/types";

interface BatchFormProps {
  batch?: Batch;
  defaultYear?: number;
}

export function BatchForm({ batch, defaultYear = 2026 }: BatchFormProps) {
  const isEditing = Boolean(batch);

  const boundAction = isEditing
    ? updateBatch.bind(null, batch!.id)
    : createBatch;

  const [state, formAction, isPending] = useActionState(boundAction, null);

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

      {/* Batch Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Batch Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={batch?.name ?? ""}
          disabled={isPending}
          placeholder="e.g. 2026 Theory, 2027 Revision"
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">
          A distinctive name to identify this tuition class.
        </p>
      </div>

      {/* Exam Year */}
      <div className="space-y-2">
        <Label htmlFor="year">
          A/L Examination Year <span className="text-destructive">*</span>
        </Label>
        <Input
          id="year"
          name="year"
          type="number"
          required
          min={2020}
          max={2035}
          defaultValue={batch?.year ?? defaultYear}
          disabled={isPending}
          className="h-10 max-w-xs"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={batch?.description ?? ""}
          disabled={isPending}
          placeholder="Add class times, syllabus details, or location..."
        />
      </div>

      {/* Archive Checkbox (Only on Edit) */}
      {isEditing && (
        <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/20">
          <input
            id="is_archived"
            name="is_archived"
            type="checkbox"
            defaultChecked={batch?.is_archived ?? false}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
          <div className="space-y-0.5">
            <Label htmlFor="is_archived" className="text-sm font-medium cursor-pointer">
              Archive this batch
            </Label>
            <p className="text-xs text-muted-foreground">
              Archived batches are hidden from active student feeds. Historical lessons remain saved.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEditing ? "Saving changes..." : "Creating batch..."}
            </>
          ) : isEditing ? (
            "Save Changes"
          ) : (
            "Create Batch"
          )}
        </Button>

        <Link
          href={isEditing ? `/dashboard/batches/${batch!.id}` : "/dashboard/batches"}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
