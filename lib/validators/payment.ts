// lib/validators/payment.ts
// Validation rules and magic byte verification for payment slips and manual billing proof.

/**
 * Permitted MIME types for deposit receipts (SEC-3B2C2-LOW-01).
 */
export const ALLOWED_SLIP_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

export const MAX_PAYMENT_SLIP_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validates a payment slip buffer against magic bytes and size constraints (SEC-3B2C2-LOW-01).
 * Rejects mismatched extensions, executable files, HTML, SVG, and oversized payloads.
 */
export function validatePaymentSlipBuffer(
  buffer: Buffer,
  mimeType: string
): { valid: boolean; error?: string } {
  if (buffer.length > MAX_PAYMENT_SLIP_BYTES) {
    return {
      valid: false,
      error: `Payment receipt exceeds maximum allowed file size of 5 MB (Received: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`,
    };
  }

  if (!ALLOWED_SLIP_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: "Invalid file format. Only PDF, JPEG, and PNG payment receipts are accepted.",
    };
  }

  // Magic byte inspection (does not trust filename extension)
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isPdf =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46; // %PDF

  if (
    (mimeType === "image/jpeg" && !isJpeg) ||
    (mimeType === "image/png" && !isPng) ||
    (mimeType === "application/pdf" && !isPdf) ||
    (!isJpeg && !isPng && !isPdf)
  ) {
    return {
      valid: false,
      error: "File content does not match the declared MIME type header.",
    };
  }

  return { valid: true };
}
