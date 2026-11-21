// lib/validators/announcement.ts
// Zod schemas for announcement create and update operations.

import { z } from "zod";
import {
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_BODY_MAX_LENGTH,
} from "@/lib/constants";

export const createAnnouncementSchema = z
  .object({
    title: z
      .string()
      .min(1, "Announcement title is required")
      .max(ANNOUNCEMENT_TITLE_MAX_LENGTH, `Title must be ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters or fewer`)
      .trim(),
    body: z
      .string()
      .min(1, "Announcement body cannot be empty")
      .max(ANNOUNCEMENT_BODY_MAX_LENGTH, `Body must be ${ANNOUNCEMENT_BODY_MAX_LENGTH} characters or fewer`)
      .trim(),
    is_broadcast: z.boolean().default(false),
    batch_ids: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => data.is_broadcast || (data.batch_ids && data.batch_ids.length > 0),
    {
      message: "Select at least one batch, or choose 'All Batches'",
      path: ["batch_ids"],
    }
  );

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
