// components/notes/NoteForm.tsx
// Client component for uploading or editing a study note with PDF file picker and batch selection.

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createNote, updateNote } from "@/actions/notes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, FileText, Loader2, UploadCloud, Link as LinkIcon } from "lucide-react";
import type { Batch, Note } from "@/types";

interface NoteFormProps {
  batches: Batch[];
  preSelectedBatchId?: string;
  note?: Note & { batch_ids?: string[] };
}

export function NoteForm({
  batches,
  preSelectedBatchId,
  note,
}: NoteFormProps) {
  const isEditing = Boolean(note);

  const initialBatchIds = note?.batch_ids
    ? new Set(note.batch_ids)
    : new Set(preSelectedBatchId ? [preSelectedBatchId] : []);

  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(initialBatchIds);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showExternalUrl, setShowExternalUrl] = useState(false);

  const boundAction = isEditing
    ? updateNote.bind(null, note!.id)
    : createNote;

  const [state, formAction, isPending] = useActionState(boundAction, null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
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
    ? `/dashboard/notes/${note!.id}`
    : "/dashboard/notes";

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      {state?.error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive animate-in fade-in-50"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Note Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-xs font-bold text-foreground">
          Note Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={note?.title ?? ""}
          disabled={isPending}
          placeholder="e.g. Unit 02: Kinematics & Mechanics Revision Notes"
          className="h-10 rounded-xl"
        />
        <p className="text-[11px] text-muted-foreground">
          A descriptive title for this PDF handout or chapter guide.
        </p>
      </div>

      {/* PDF File Upload Container */}
      <div className="space-y-2">
        <Label className="text-xs font-bold text-foreground">
          PDF Document <span className="text-destructive">{!isEditing ? "*" : ""}</span>
        </Label>

        <div className="rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-5 text-center transition-colors hover:border-primary/50">
          <input
            id="file"
            name="file"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            disabled={isPending}
            className="hidden"
          />

          <label
            htmlFor="file"
            className="flex flex-col items-center justify-center cursor-pointer space-y-2"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>

            {selectedFile ? (
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-foreground">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>{selectedFile.name}</span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready for upload
                </p>
              </div>
            ) : isEditing && note ? (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-foreground">
                  Current file: <span className="font-mono text-primary">{note.file_name}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Click to choose a new PDF to replace this file (optional)
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  Click to select PDF or drag and drop
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Max file size: 50 MB (.pdf format)
                </p>
              </div>
            )}
          </label>
        </div>

        {/* External URL alternative toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowExternalUrl((prev) => !prev)}
            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <LinkIcon className="h-3 w-3" />
            <span>{showExternalUrl ? "Hide external document URL" : "Or link from Google Drive / Web URL"}</span>
          </button>

          {showExternalUrl && (
            <div className="mt-2 space-y-1.5 animate-in fade-in-50">
              <Input
                id="file_url"
                name="file_url"
                type="url"
                defaultValue={note?.file_url ?? ""}
                disabled={isPending}
                placeholder="https://drive.google.com/file/... or direct PDF URL"
                className="h-10 rounded-xl font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Ensure public access is enabled if using a Google Drive document link.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Description / Overview */}
      <div className="space-y-2">
        <Label htmlFor="description" className="text-xs font-bold text-foreground">
          Description / Study Instructions (Optional)
        </Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={note?.description ?? ""}
          disabled={isPending}
          placeholder="Brief summary of concepts, homework problems, or lecture alignment..."
          className="rounded-xl text-xs"
        />
      </div>

      {/* Batch Assignment Checkboxes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold text-foreground">
            Assign to Batches <span className="text-destructive">*</span>
          </Label>
          {batches.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllBatches}
                className="text-primary hover:underline font-semibold"
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
          <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
            No batches exist yet. Create a batch before publishing notes.
          </p>
        ) : (
          <div className="space-y-2 rounded-2xl border border-border/80 bg-muted/10 p-3">
            {batches.map((b) => {
              const isChecked = selectedBatches.has(b.id);
              return (
                <label
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
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
                    <span className="text-xs font-bold text-foreground">
                      {b.name}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                      ({b.year} A/L)
                    </span>
                    {b.is_archived && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit / Cancel Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending || selectedBatches.size === 0}
          className="h-10 px-5 rounded-xl font-bold cursor-pointer"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Upload & Publish Note"}
        </Button>

        <Link
          href={cancelHref}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-xs font-semibold hover:bg-muted transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
