// components/announcements/AnnouncementForm.tsx
// Client component for creating or editing announcements with broadcast and batch targeting.

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createAnnouncement, updateAnnouncement } from "@/actions/announcements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2, Radio, Pin } from "lucide-react";
import type { Batch, Announcement } from "@/types";

interface AnnouncementFormProps {
  batches: Batch[];
  preSelectedBatchId?: string;
  announcement?: Announcement & { batch_ids?: string[] };
}

export function AnnouncementForm({
  batches,
  preSelectedBatchId,
  announcement,
}: AnnouncementFormProps) {
  const isEditing = Boolean(announcement);

  const initialBroadcast = announcement ? announcement.is_broadcast : !preSelectedBatchId;
  const [isBroadcast, setIsBroadcast] = useState(initialBroadcast);

  const initialBatchIds = announcement?.batch_ids
    ? new Set(announcement.batch_ids)
    : new Set(preSelectedBatchId ? [preSelectedBatchId] : []);

  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(initialBatchIds);

  const boundAction = isEditing
    ? updateAnnouncement.bind(null, announcement!.id)
    : createAnnouncement;

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

  const selectAllBatches = () => {
    setSelectedBatches(new Set(batches.map((b) => b.id)));
  };

  const deselectAllBatches = () => {
    setSelectedBatches(new Set());
  };

  const cancelHref = preSelectedBatchId
    ? `/dashboard/batches/${preSelectedBatchId}`
    : "/dashboard/announcements";

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

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">
          Announcement Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={announcement?.title ?? ""}
          disabled={isPending}
          placeholder="e.g. Next Class Rescheduled to Sunday 9:00 AM"
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">
          A clear headline summarizing the update.
        </p>
      </div>

      {/* Body */}
      <div className="space-y-2">
        <Label htmlFor="body">
          Announcement Content <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="body"
          name="body"
          rows={5}
          required
          defaultValue={announcement?.body ?? ""}
          disabled={isPending}
          placeholder="Write the full announcement text, instructions, links, or holiday details..."
        />
      </div>

      {/* Audience Scope Selection */}
      <div className="space-y-4 rounded-xl border p-4 bg-muted/20">
        <Label className="text-sm font-semibold">Audience & Targeting</Label>

        {/* Broadcast Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_broadcast"
            checked={isBroadcast}
            onChange={(e) => setIsBroadcast(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          />
          <div>
            <div className="flex items-center gap-1.5 font-medium text-sm text-foreground">
              <Radio className="h-4 w-4 text-indigo-600" />
              <span>Broadcast to all batches</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notice will be visible to all active tuition cohorts and enrolled students.
            </p>
          </div>
        </label>

        {/* Specific Batch Selection (shown if not broadcast) */}
        {!isBroadcast && (
          <div className="pt-2 border-t space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Target Specific Batches <span className="text-destructive">*</span>
              </span>
              {batches.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllBatches}
                    className="text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={deselectAllBatches}
                    className="text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {batches.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                No batches created yet.
              </p>
            ) : (
              <div className="space-y-1.5 rounded-lg border bg-background p-3">
                {batches.map((b) => {
                  const isChecked = selectedBatches.has(b.id);
                  return (
                    <label
                      key={b.id}
                      className="flex items-center gap-3 cursor-pointer rounded-md p-2 hover:bg-muted/50 transition-colors text-xs"
                    >
                      <input
                        type="checkbox"
                        name="batch_ids"
                        value={b.id}
                        checked={isChecked}
                        onChange={() => toggleBatch(b.id)}
                        disabled={isPending}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-foreground">{b.name}</span>
                      <span className="text-muted-foreground">({b.year} A/L)</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pin to Top Checkbox */}
      <div className="rounded-xl border p-4 bg-muted/20">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_pinned"
            defaultChecked={announcement?.is_pinned ?? false}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-600"
          />
          <div>
            <div className="flex items-center gap-1.5 font-medium text-sm text-foreground">
              <Pin className="h-4 w-4 text-amber-600" />
              <span>Pin to top</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pinned notices remain at the top of the feed until unpinned.
            </p>
          </div>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending || (!isBroadcast && selectedBatches.size === 0)}
          className="h-10 px-5"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Publish Announcement"}
        </Button>

        <Link
          href={cancelHref}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
