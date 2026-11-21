// lib/validators/student.ts
// Zod schemas for student create and update operations.

import { z } from "zod";

export const createStudentSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(100, "Full name must be 100 characters or fewer"),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be 50 characters or fewer")
    .regex(
      /^[a-z0-9_-]+$/,
      "Username may only contain lowercase letters, numbers, hyphens, and underscores"
    )
    .toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be 72 characters or fewer"),
  batch_ids: z
    .array(z.string().uuid("Invalid batch ID"))
    .min(1, "Assign the student to at least one batch")
    .refine((items) => new Set(items).size === items.length, {
      message: "Duplicate batches selected",
    }),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number must be 20 characters or fewer")
    .optional()
    .or(z.literal("")),
});

export const updateStudentSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(100, "Full name must be 100 characters or fewer")
    .optional(),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number must be 20 characters or fewer")
    .optional()
    .or(z.literal("")),
  batch_ids: z
    .array(z.string().uuid("Invalid batch ID"))
    .min(1, "Assign the student to at least one batch")
    .refine((items) => new Set(items).size === items.length, {
      message: "Duplicate batches selected",
    })
    .optional(),
  is_active: z.boolean().optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
