// lib/validators/lesson.ts
// Zod schemas for lesson create and update operations.

import { z } from "zod";
import { isValidYouTubeUrl } from "@/lib/utils/youtube";
import {
  LESSON_TITLE_MAX_LENGTH,
  LESSON_DESCRIPTION_MAX_LENGTH,
} from "@/lib/constants";

export const createLessonSchema = z.object({
  title: z
    .string()
    .min(1, "Lesson title is required")
    .max(LESSON_TITLE_MAX_LENGTH, `Title must be ${LESSON_TITLE_MAX_LENGTH} characters or fewer`)
    .trim(),
  youtube_url: z
    .string()
    .min(1, "YouTube URL is required")
    .refine(isValidYouTubeUrl, {
      message: "Please enter a valid YouTube URL",
    }),
  description: z
    .string()
    .max(LESSON_DESCRIPTION_MAX_LENGTH, `Description must be ${LESSON_DESCRIPTION_MAX_LENGTH} characters or fewer`)
    .trim()
    .optional(),
  batch_ids: z
    .array(z.string().uuid())
    .min(1, "Assign the lesson to at least one batch"),
  sort_order: z.number().int().min(0).optional(),
});

export const updateLessonSchema = createLessonSchema.partial().omit({
  batch_ids: true,
}).extend({
  batch_ids: z.array(z.string().uuid()).min(1, "Assign the lesson to at least one batch").optional(),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
