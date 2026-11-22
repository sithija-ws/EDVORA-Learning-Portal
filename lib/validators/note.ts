// lib/validators/note.ts
// Zod schemas for PDF notes create and update operations.

import { z } from "zod";
import {
  NOTE_TITLE_MAX_LENGTH,
  NOTE_DESCRIPTION_MAX_LENGTH,
} from "@/lib/constants";

export const createNoteSchema = z.object({
  title: z
    .string()
    .min(1, "Note title is required")
    .max(NOTE_TITLE_MAX_LENGTH, `Title must be ${NOTE_TITLE_MAX_LENGTH} characters or fewer`)
    .trim(),
  description: z
    .string()
    .max(NOTE_DESCRIPTION_MAX_LENGTH, `Description must be ${NOTE_DESCRIPTION_MAX_LENGTH} characters or fewer`)
    .trim()
    .optional(),
  batch_ids: z
    .array(z.string().uuid())
    .min(1, "Assign the note to at least one batch"),
  file_url: z.string().url("Must be a valid URL").optional(),
});

export const updateNoteSchema = createNoteSchema.partial().omit({
  batch_ids: true,
}).extend({
  batch_ids: z.array(z.string().uuid()).min(1, "Assign the note to at least one batch").optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
