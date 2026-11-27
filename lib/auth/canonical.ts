// lib/auth/canonical.ts
// Provider-aware email canonicalization and cryptographic hashing for trial abuse prevention.
//
// ⚠️ ARCHITECTURAL LIMITATION & SECURITY CONTEXT:
// Canonicalization normalizes known alias behaviors (such as Gmail dot-removal and plus-addressing)
// to prevent trivial trial abuse from a single mailbox.
// However, no email canonicalization algorithm can prove whether two completely different email
// addresses (e.g., alice@gmail.com vs alice.perera@yahoo.com) belong to the same physical person.

import { createHash } from "crypto";

/**
 * Domains known to support plus-addressing (`user+tag@domain`).
 */
const PLUS_ADDRESSING_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "icloud.com",
  "me.com",
  "mac.com",
  "fastmail.com",
  "fastmail.fm",
]);

/**
 * Domains known to completely ignore dots in the username portion.
 */
const DOT_IGNORING_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
]);

/**
 * Computes the provider-aware canonical representation of an email address.
 *
 * Rules:
 * 1. Normalize unicode (NFKC), strip whitespace, and convert to lowercase.
 * 2. For Google (`gmail.com`, `googlemail.com`):
 *    - Standardize domain to `gmail.com`.
 *    - Remove all dots (`.`) from username.
 *    - Remove plus-addressing tags (`+tag`).
 * 3. For other known providers (Microsoft, Proton, iCloud, Fastmail):
 *    - Remove plus-addressing tags (`+tag`).
 *    - Preserve dots (dots are significant in these systems).
 * 4. For unknown / corporate / school domains:
 *    - Preserve dots and plus characters to avoid mangling valid literal addresses.
 */
export function canonicalizeEmail(email: string): string {
  if (!email || typeof email !== "string") {
    return "";
  }

  const normalized = email.normalize("NFKC").trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return normalized;
  }

  let localPart = normalized.slice(0, atIndex);
  let domain = normalized.slice(atIndex + 1);

  // Standardize Google domain aliases
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  if (DOT_IGNORING_DOMAINS.has(domain)) {
    // 1. Strip plus-addressing
    const plusIndex = localPart.indexOf("+");
    if (plusIndex !== -1) {
      localPart = localPart.slice(0, plusIndex);
    }
    // 2. Remove all dots
    localPart = localPart.replace(/\./g, "");
  } else if (PLUS_ADDRESSING_DOMAINS.has(domain)) {
    // Strip plus-addressing only; preserve dots
    const plusIndex = localPart.indexOf("+");
    if (plusIndex !== -1) {
      localPart = localPart.slice(0, plusIndex);
    }
  }

  return `${localPart}@${domain}`;
}

/**
 * Computes a SHA-256 cryptographic digest of the canonical email identity.
 * Used for duplicate trial claim registry (`teacher_trial_claims.normalized_email_hash`)
 * to prevent storing raw email addresses unnecessarily.
 */
export function getCanonicalEmailHash(email: string): string {
  const canonical = canonicalizeEmail(email);
  return createHash("sha256").update(canonical).digest("hex");
}
