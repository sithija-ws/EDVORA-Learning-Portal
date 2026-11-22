// lib/validators/announcement.ts
// Zod schemas for announcement create and update operations.

import { z } from "zod";
import {
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_BODY_MAX_LENGTH,
} from "@/lib/constants";

export const baseAnnouncementSchema = z.object({
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
  is_pinned: z.boolean().default(false),
  batch_ids: z.array(z.string().uuid()).optional(),
});

export const createAnnouncementSchema = baseAnnouncementSchema.refine(
  (data) => data.is_broadcast || (data.batch_ids && data.batch_ids.length > 0),
  {
    message: "Select at least one batch, or choose 'All Batches (Broadcast)'",
    path: ["batch_ids"],
  }
);

export const updateAnnouncementSchema = baseAnnouncementSchema.partial().refine(
  (data) => {
    if (data.is_broadcast === undefined && data.batch_ids === undefined) return true;
    if (data.is_broadcast === true) return true;
    if (data.is_broadcast === false) {
      return data.batch_ids !== undefined && data.batch_ids.length > 0;
    }
    return true;
  },
  {
    message: "Select at least one batch if not broadcasting to all batches",
    path: ["batch_ids"],
  }
);

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
