// components/lessons/LessonForm.tsx
// Client component for creating or editing a lesson with dynamic YouTube thumbnail preview.

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createLesson, updateLesson } from "@/actions/lessons";
import { extractYouTubeId, buildThumbnailUrl } from "@/lib/utils/youtube";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Loader2, Play, Video } from "lucide-react";
import type { Batch, Lesson } from "@/types";

interface LessonFormProps {
  batches: Batch[];
  preSelectedBatchId?: string;
  lesson?: Lesson & { batch_ids?: string[] };
}

export function LessonForm({
  batches,
  preSelectedBatchId,
  lesson,
}: LessonFormProps) {
  const isEditing = Boolean(lesson);

  const initialBatchIds = lesson?.batch_ids
    ? new Set(lesson.batch_ids)
    : new Set(preSelectedBatchId ? [preSelectedBatchId] : []);

  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(initialBatchIds);

  const initialYoutubeUrl = lesson ? `https://www.youtube.com/watch?v=${lesson.youtube_id}` : "";
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl);
  const [previewId, setPreviewId] = useState<string | null>(
    lesson ? lesson.youtube_id : null
  );

  const boundAction = isEditing
    ? updateLesson.bind(null, lesson!.id)
    : createLesson;

  const [state, formAction, isPending] = useActionState(boundAction, null);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setYoutubeUrl(url);
    const id = extractYouTubeId(url);
    setPreviewId(id);
  };

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
    : isEditing
    ? `/dashboard/lessons/${lesson!.id}`
    : "/dashboard/lessons";

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

      {/* Lesson Title */}
      <div className="space-y-2">
        <Label htmlFor="title">
          Lesson Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={lesson?.title ?? ""}
          disabled={isPending}
          placeholder="e.g. Unit 3: Introduction to Electronics"
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">
          Clear, descriptive topic title visible to students.
        </p>
      </div>

      {/* YouTube URL with instant preview */}
      <div className="space-y-2">
        <Label htmlFor="youtube_url">
          YouTube Video URL <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="youtube_url"
            name="youtube_url"
            type="url"
            required={!isEditing}
            value={youtubeUrl}
            onChange={handleUrlChange}
            disabled={isPending}
            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            className="h-10 pr-9 font-mono text-xs"
          />
          <div className="absolute right-3 top-2.5 text-muted-foreground">
            {previewId ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Video className="h-5 w-5" />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste any YouTube watch, share, or shorts link (unlisted recommended).
        </p>

        {/* Live Video Thumbnail Preview */}
        {previewId && (
          <div className="mt-3 overflow-hidden rounded-xl border bg-muted/30 p-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Video Preview Detected
            </div>
            <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildThumbnailUrl(previewId)}
                alt="YouTube Video Preview"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-md">
                  <Play className="h-5 w-5 fill-current ml-0.5" />
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs font-mono text-muted-foreground">
              Video ID: <span className="font-semibold text-foreground">{previewId}</span>
            </p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Lesson Description / Notes (Optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={lesson?.description ?? ""}
          disabled={isPending}
          placeholder="Summary of concepts covered, homework references, or timestamps..."
        />
      </div>

      {/* Batch Assignment Checkboxes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Assign to Batches <span className="text-destructive">*</span>
          </Label>
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
          <p className="text-xs text-primary bg-primary/8 p-3 rounded-lg border border-primary/20">
            No batches exist yet. Create a batch before publishing lessons.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border p-4 bg-muted/10">
            {batches.map((b) => {
              const isChecked = selectedBatches.has(b.id);
              return (
                <label
                  key={b.id}
                  className="flex items-center gap-3 cursor-pointer rounded-md p-2 hover:bg-muted/50 transition-colors"
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
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">
                      {b.name}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({b.year} A/L)
                    </span>
                    {b.is_archived && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Only students enrolled in these batches can view this lesson.
        </p>
      </div>

      {/* Sort Order */}
      <div className="space-y-2">
        <Label htmlFor="sort_order">Display Order Index (Optional)</Label>
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          min={0}
          defaultValue={lesson?.sort_order ?? 0}
          disabled={isPending}
          className="h-10 max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          Lower numbers appear first (e.g. 1 for first lesson, 2 for second).
        </p>
      </div>

      {/* Submit / Cancel Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending || selectedBatches.size === 0}
          className="h-10 px-5"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Publish Lesson"}
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
