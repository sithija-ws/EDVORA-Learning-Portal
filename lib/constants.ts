// lib/constants.ts
// Application-wide constants for Edvora.
// Import from here rather than hardcoding strings throughout the codebase.

// ─── Auth / Identity ──────────────────────────────────────────────────────────

/**
 * The fake domain suffix appended to student usernames to form a valid email
 * for Supabase Auth. Example: username "kumari-2027" → "kumari-2027@edvora.internal"
 *
 * No email is ever sent to this domain. It is purely an internal identifier.
 */
export const STUDENT_EMAIL_DOMAIN = "edvora.internal" as const;

/**
 * User roles used throughout the application and enforced in the database.
 */
export const ROLES = {
  TEACHER: "teacher",
  STUDENT: "student",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// ─── Routing ──────────────────────────────────────────────────────────────────

/**
 * Canonical redirect paths after login, keyed by role.
 */
export const ROLE_HOME = {
  [ROLES.TEACHER]: "/dashboard",
  [ROLES.STUDENT]: "/home",
} as const;

/**
 * Public routes that do not require authentication.
 */
export const PUBLIC_ROUTES = ["/login", "/disabled"] as const;

/**
 * The login page path.
 */
export const LOGIN_PATH = "/login" as const;

/**
 * The disabled account page path.
 */
export const DISABLED_PATH = "/disabled" as const;

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Number of recent announcements shown on the student home screen.
 */
export const HOME_ANNOUNCEMENT_LIMIT = 3 as const;

/**
 * Default page size for paginated lists (future use).
 */
export const DEFAULT_PAGE_SIZE = 20 as const;

// ─── Content ──────────────────────────────────────────────────────────────────

/**
 * Maximum length for announcement titles.
 */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 200 as const;

/**
 * Maximum length for announcement body text.
 */
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 5000 as const;

/**
 * Maximum length for lesson titles.
 */
export const LESSON_TITLE_MAX_LENGTH = 200 as const;

/**
 * Maximum length for lesson descriptions.
 */
export const LESSON_DESCRIPTION_MAX_LENGTH = 2000 as const;

/**
 * Maximum length for batch names.
 */
export const BATCH_NAME_MAX_LENGTH = 100 as const;
