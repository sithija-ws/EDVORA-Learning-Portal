// lib/validators/admin.ts
// Zod schemas for platform administrator actions, application reviews, and settings.

import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const approveApplicationSchema = z.object({
  applicationId: z
    .string()
    .uuid("Invalid application ID"),
  verificationMode: z
    .enum(["phone_call", "in_person", "official_registry"]),
  verifiedPhone: z
    .string()
    .trim()
    .min(7, "A valid verified contact number is required")
    .max(25, "Phone number cannot exceed 25 characters"),
  reviewNotes: z
    .string()
    .trim()
    .max(1000, "Review notes cannot exceed 1000 characters")
    .optional()
    .or(z.literal("")),
});

export type ApproveApplicationInput = z.infer<typeof approveApplicationSchema>;

export const rejectApplicationSchema = z.object({
  applicationId: z
    .string()
    .uuid("Invalid application ID"),
  reviewNotes: z
    .string()
    .trim()
    .min(3, "Rejection reason is required")
    .max(1000, "Rejection reason cannot exceed 1000 characters"),
});

export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;

export const toggleWorkspaceSchema = z.object({
  tenantId: z
    .string()
    .uuid("Invalid workspace ID"),
  isActive: z.boolean(),
});

export type ToggleWorkspaceInput = z.infer<typeof toggleWorkspaceSchema>;

export const verifyPaymentSlipSchema = z.object({
  paymentId: z
    .string()
    .uuid("Invalid payment ID"),
  approve: z.boolean(),
  rejectionReason: z
    .string()
    .trim()
    .max(500, "Rejection reason cannot exceed 500 characters")
    .optional()
    .or(z.literal("")),
  extensionDays: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional(),
});

export type VerifyPaymentSlipInput = z.infer<typeof verifyPaymentSlipSchema>;
