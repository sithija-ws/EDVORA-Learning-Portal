// lib/validators/student.ts
// Zod schemas for student create and update operations.

import { z } from "zod";

export const createStudentSchema = z.object({
  full_name: z
    .string()
    .min(1, "Full name is required")
    .max(100, "Name must be 100 characters or fewer")
    .trim(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be 50 characters or fewer")
    .regex(
      /^[a-z0-9_-]+$/,
      "Username may only contain lowercase letters, numbers, hyphens and underscores"
    )
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be 72 characters or fewer"),
  batch_id: z.string().uuid("Invalid batch"),
  phone: z
    .string()
    .max(20, "Phone number must be 20 characters or fewer")
    .trim()
    .optional(),
});

export const updateStudentSchema = z.object({
  full_name: z
    .string()
    .min(1, "Full name is required")
    .max(100, "Name must be 100 characters or fewer")
    .trim()
    .optional(),
  phone: z
    .string()
    .max(20, "Phone number must be 20 characters or fewer")
    .trim()
    .optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
