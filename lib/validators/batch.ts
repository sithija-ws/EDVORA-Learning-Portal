// lib/validators/batch.ts
// Zod schemas for batch create and update operations.

import { z } from "zod";
import {
  BATCH_NAME_MAX_LENGTH,
} from "@/lib/constants";

export const createBatchSchema = z.object({
  name: z
    .string()
    .min(1, "Batch name is required")
    .max(BATCH_NAME_MAX_LENGTH, `Batch name must be ${BATCH_NAME_MAX_LENGTH} characters or fewer`)
    .trim(),
  year: z
    .number()
    .int()
    .min(2020)
    .max(2035),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer")
    .trim()
    .optional(),
});

export const updateBatchSchema = createBatchSchema.partial();

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
