// types/index.ts
// Application-level TypeScript types for Edvora.
// Database row types are in types/database.ts (generated or manually maintained).

import type { ROLES } from "@/lib/constants";

// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = (typeof ROLES)[keyof typeof ROLES];

// ─── Profile (application user) ───────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  batch_id: string | null;
  is_active: boolean;
  phone: string | null;
  created_at: string;
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
  lesson_batches: Array<{ batch_id: string }>;
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
  announcement_batches: Array<{ batch_id: string }>;
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
