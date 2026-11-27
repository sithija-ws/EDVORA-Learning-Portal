// types/index.ts
// Application-level TypeScript types for Edvora.
// Database row types are in types/database.ts.

import type { ROLES } from "@/lib/constants";

// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = (typeof ROLES)[keyof typeof ROLES];

// ─── Profile (application user) ───────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  phone: string | null;
  created_at: string;
}

export interface TeacherProfile extends Profile {
  role: typeof ROLES.TEACHER;
}

export interface StudentProfile extends Profile {
  role: typeof ROLES.STUDENT;
}

// ─── Batch ────────────────────────────────────────────────────────────────────

export interface Batch {
  id: string;
  tenant_id?: string;
  name: string;
  year: number;
  description: string | null;
  is_archived: boolean;
  created_at: string;
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

export interface Enrollment {
  tenant_id?: string;
  student_id: string;
  batch_id: string;
  created_at: string;
}

export interface EnrollmentWithBatch extends Enrollment {
  batch: Batch;
}

/**
 * Student profile view model with joined enrollment and batch information.
 */
export interface StudentRecord extends StudentProfile {
  enrollments: Enrollment[];
  batches: Batch[];
}

// ─── Lesson ───────────────────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  tenant_id?: string;
  title: string;
  description: string | null;
  youtube_id: string;
  thumbnail_url: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LessonWithBatches extends Lesson {
  lesson_batches: Array<{ batch_id: string; batch?: Batch }>;
}

// ─── Announcement ─────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  tenant_id?: string;
  title: string;
  body: string;
  is_broadcast: boolean;
  is_pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementWithBatches extends Announcement {
  announcement_batches: Array<{ batch_id: string; batch?: Batch }>;
}

// ─── Note (PDF study materials) ───────────────────────────────────────────────

export interface Note {
  id: string;
  tenant_id?: string;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NoteWithBatches extends Note {
  note_batches: Array<{ batch_id: string; batch?: Batch }>;
}

// ─── Form / Action utilities ──────────────────────────────────────────────────

/**
 * Standard shape returned by Server Actions.
 * `error` is null on success; `data` is null on failure.
 */
export type ActionResult<T = void> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

/**
 * Field-level validation errors, compatible with Zod's `.flatten()` output.
 */
export interface FieldErrors {
  [field: string]: string[] | undefined;
}

// ─── Multi-Tenant SaaS Types ──────────────────────────────────────────────────

export type TenantRole = "owner" | "admin" | "instructor" | "assistant";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: string;
  max_students: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
  updated_at: string;
}

export interface TenantWithMembership extends Tenant {
  role: TenantRole;
  membership_id: string;
}

export interface AvailableWorkspaceSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  membershipId: string;
}

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: TenantRole;
  membershipId: string;
  isSubscriptionActive: boolean;
  subscriptionStatus:
    | "pending"
    | "trialing"
    | "active"
    | "expired"
    | "suspended"
    | "pending_payment";
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  isTrial: boolean;
  trialRemainingSeconds: number;
}

// ─── Commercial Subscription Types ──────────────────────────────────────────

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_lkr_monthly: number;
  price_lkr_annual: number | null;
  max_students: number;
  max_storage_bytes: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status:
    | "pending"
    | "trialing"
    | "active"
    | "expired"
    | "suspended"
    | "pending_payment";
  billing_cycle: "monthly" | "annual";
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  custom_student_limit: number | null;
  custom_storage_limit_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPayment {
  id: string;
  tenant_id: string;
  subscription_id: string;
  plan_id: string;
  amount_lkr: number;
  billing_cycle: "monthly" | "annual";
  payment_method: "bank_transfer" | "online_gateway" | "manual_cash";
  status: "pending" | "verified" | "rejected" | "refunded";
  reference_number: string | null;
  slip_url: string | null;
  submitted_by: string;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}


