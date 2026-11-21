// lib/utils/format.ts
// Date/time and text formatting utilities used throughout Edvora.

/**
 * Formats a date/time string into a human-readable relative or absolute format.
 * Examples:
 *   "Just now"
 *   "5 minutes ago"
 *   "2 hours ago"
 *   "Yesterday at 3:45 PM"
 *   "21 Nov 2026"
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return `Yesterday at ${formatTime(date)}`;
  if (diffDays < 7) return `${diffDays} days ago`;

  return formatDate(date);
}

/**
 * Formats a date as "21 Nov 2026".
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formats a time as "3:45 PM".
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats a date/time as "21 Nov 2026 at 3:45 PM".
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return `${formatDate(date)} at ${formatTime(date)}`;
}

/**
 * Truncates a string to a maximum length, appending "…" if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}
