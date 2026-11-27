// lib/validators/auth.ts
// Zod schemas for authentication forms supporting multi-tenant student and teacher logins.

import { z } from "zod";

export const loginSchema = z.object({
  workspace: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .or(z.literal("")),
  username: z
    .string()
    .min(1, "Username or email is required")
    .trim(),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerTeacherSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name cannot exceed 100 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
  phoneNumber: z
    .string()
    .trim()
    .max(20, "Phone number cannot exceed 20 characters")
    .optional()
    .or(z.literal("")),
  workspaceName: z
    .string()
    .trim()
    .min(2, "Tuition workspace name must be at least 2 characters")
    .max(100, "Tuition workspace name cannot exceed 100 characters"),
  workspaceSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Workspace identifier may only contain lowercase letters, numbers, and hyphens"
    )
    .min(3, "Workspace identifier must be at least 3 characters")
    .max(50, "Workspace identifier cannot exceed 50 characters")
    .optional()
    .or(z.literal("")),
});

export type RegisterTeacherInput = z.infer<typeof registerTeacherSchema>;

export const subscriptionPaymentSchema = z.object({
  planCode: z.enum(["starter", "growth", "pro"]),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
  amountLkr: z
    .number()
    .positive("Payment amount must be greater than zero"),
  referenceNumber: z
    .string()
    .trim()
    .min(3, "Bank reference or receipt number is required")
    .max(100, "Reference number cannot exceed 100 characters"),
  slipUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

export type SubscriptionPaymentInput = z.infer<typeof subscriptionPaymentSchema>;

