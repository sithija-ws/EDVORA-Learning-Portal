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
  name: string;
  year: number;
  description: string | null;
  is_archived: boolean;
  created_at: string;
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

export interface Enrollment {
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
