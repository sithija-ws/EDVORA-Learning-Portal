// lib/utils/youtube.ts
// Utilities for parsing and working with YouTube URLs.
// No YouTube API key required — thumbnails use the public CDN.

/**
 * Extracts the 11-character YouTube video ID from any supported URL format.
 *
 * Supported formats:
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   https://youtu.be/dQw4w9WgXcQ
 *   https://www.youtube.com/embed/dQw4w9WgXcQ
 *   https://www.youtube.com/shorts/dQw4w9WgXcQ
 *
 * Returns null if the URL is not a recognisable YouTube URL.
 */
export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  const pattern =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(pattern);
  return match ? match[1] : null;
}

/**
 * Builds the highest-quality available thumbnail URL for a YouTube video.
 * Falls back gracefully — hqdefault is universally available.
 */
export function buildThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Builds the YouTube embed URL for use in an iframe.
 * Applies recommended iframe parameters for a clean, privacy-respecting embed.
 */
export function buildEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    rel: "0",           // Do not show related videos from other channels
    modestbranding: "1", // Minimal YouTube branding
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Returns true if the provided string looks like a valid YouTube URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}
