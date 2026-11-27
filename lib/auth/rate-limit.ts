// lib/auth/rate-limit.ts
// Serverless-safe, atomic rate limiter for authentication endpoints.
// Uses PostgreSQL (public.auth_rate_limits table + check/record RPCs) via Supabase
// service-role client to enforce atomic concurrency across separate Vercel instances.
// STRICT SECURITY REQUIREMENT: Fail-Closed. No in-memory fallback is permitted.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerAdminClient } from "@/lib/supabase/server";

// ─── Configuration & Defaults ─────────────────────────────────────────────────

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_WINDOW_SECONDS = 60; // 60 seconds
export const DEFAULT_LOCKOUT_SECONDS = 60; // 60 seconds lockout

/**
 * Account-tier rate limiting: Protects individual accounts against repeated brute-force.
 * Stricter threshold (5 attempts / 60s) to prevent credential guessing.
 */
export const ACCOUNT_RATE_LIMIT_OPTIONS = {
  maxAttempts: 5,
  windowSeconds: 60,
  lockoutSeconds: 60,
};

/**
 * IP-tier rate limiting: Protects the application against horizontal password spraying.
 * Generous threshold (30 attempts / 60s) accommodates multiple students sharing a school NAT.
 */
export const IP_RATE_LIMIT_OPTIONS = {
  maxAttempts: 30,
  windowSeconds: 60,
  lockoutSeconds: 60,
};

export interface RateLimitOptions {
  maxAttempts?: number;
  windowSeconds?: number;
  lockoutSeconds?: number;
  supabaseClient?: SupabaseClient;
}

export interface RateLimitStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
  error?: "RATE_LIMIT_SERVICE_UNAVAILABLE";
}

// ─── Cryptographic Key Normalization ──────────────────────────────────────────

/**
 * Validates whether a string matches standard IPv4 or IPv6 format.
 */
export function isValidIpFormat(ip: string): boolean {
  const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Extracts and verifies the trusted client IP address from request headers.
 * 
 * Header Trust Model:
 * 1. `x-vercel-ip`: Injected directly by Vercel's Edge Network at the edge gateway.
 *    External client-supplied values are stripped by Vercel edge proxies.
 * 2. `x-real-ip`: Set by standard upstream reverse proxies. Validated for IP format.
 * 3. `x-forwarded-for`: In multi-hop architectures, client values appear leftmost;
 *    the rightmost valid entry appended by the nearest reverse proxy is selected.
 * 4. Fallback: If no trustworthy IP format is found, returns null. The authentication
 *    engine then relies strictly on account-level rate limiting.
 */
export function extractTrustedClientIp(
  headers: { get(name: string): string | null }
): string | null {
  // 1. Vercel edge IP header (cannot be forged by clients on Vercel deployment)
  const vercelIp = headers.get("x-vercel-ip");
  if (vercelIp && isValidIpFormat(vercelIp.trim())) {
    return vercelIp.trim();
  }

  // 2. Direct real IP header
  const realIp = headers.get("x-real-ip");
  if (realIp && isValidIpFormat(realIp.trim())) {
    return realIp.trim();
  }

  // 3. Forwarded-for chain: Take the rightmost IP address (nearest upstream proxy)
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",").map((p) => p.trim());
    const rightmost = parts[parts.length - 1];
    if (rightmost && isValidIpFormat(rightmost)) {
      return rightmost;
    }
  }

  return null;
}

/**
 * Derives a deterministic SHA-256 hex digest from the rate-limit key.
 * Prevents raw IP addresses, usernames, or workspaces from persisting in database logs.
 */
export function hashRateLimitKey(key: string): string {
  return createHash("sha256")
    .update(key.normalize("NFKC").trim().toLowerCase())
    .digest("hex");
}

// ─── Public Rate Limiting API (Strict Fail-Closed) ─────────────────────────────

/**
 * Checks whether a given rate-limiting key is permitted to attempt authentication.
 * Performs a read-only check against PostgreSQL `check_rate_limit` RPC function.
 * 
 * FAIL-CLOSED BEHAVIOR:
 * If the database RPC is unreachable or fails, this function returns `allowed: false`
 * with `error: "RATE_LIMIT_SERVICE_UNAVAILABLE"`. It NEVER allows an unverified request.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitStatus> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const keyHash = hashRateLimitKey(key);

  try {
    const adminClient = options.supabaseClient ?? createServerAdminClient();
    interface RpcResult {
      allowed: boolean;
      remaining_attempts: number;
      retry_after_seconds: number;
    }

    const { data, error } = await (adminClient as unknown as {
      rpc(fn: string, args: Record<string, unknown>): Promise<{ data: RpcResult[] | RpcResult | null; error: unknown }>;
    }).rpc("check_rate_limit", {
      p_key_hash: keyHash,
      p_max_attempts: maxAttempts,
      p_window_seconds: windowSeconds,
    });

    if (error || !data) {
      throw error ?? new Error("No data returned from check_rate_limit RPC");
    }

    const result = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(result.allowed),
      remainingAttempts: Number(result.remaining_attempts ?? 0),
      retryAfterSeconds: Number(result.retry_after_seconds ?? 0) || undefined,
    };
  } catch (err: unknown) {
    // Log sanitized error identifier without exposing raw credentials or IP addresses
    console.error(
      `[RATE_LIMIT_FAIL_CLOSED] check_rate_limit service error for key_hash=${keyHash}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    // Strict Fail-Closed: Deny authentication when verification cannot be completed
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: 60,
      error: "RATE_LIMIT_SERVICE_UNAVAILABLE",
    };
  }
}

/**
 * Records a failed authentication attempt against the key in PostgreSQL.
 * Uses atomic row locking (INSERT ... ON CONFLICT DO UPDATE) in stored procedures.
 * 
 * FAIL-CLOSED BEHAVIOR:
 * If the database RPC fails, returns `allowed: false` to ensure caller cannot proceed.
 */
export async function recordFailedAttempt(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitStatus> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const lockoutSeconds = options.lockoutSeconds ?? DEFAULT_LOCKOUT_SECONDS;
  const keyHash = hashRateLimitKey(key);

  try {
    const adminClient = options.supabaseClient ?? createServerAdminClient();
    interface RpcResult {
      allowed: boolean;
      attempts: number;
      retry_after_seconds: number;
    }

    const { data, error } = await (adminClient as unknown as {
      rpc(fn: string, args: Record<string, unknown>): Promise<{ data: RpcResult[] | RpcResult | null; error: unknown }>;
    }).rpc("record_failed_rate_limit_attempt", {
      p_key_hash: keyHash,
      p_max_attempts: maxAttempts,
      p_window_seconds: windowSeconds,
      p_lockout_seconds: lockoutSeconds,
    });

    if (error || !data) {
      throw error ?? new Error("No data returned from record_failed_rate_limit_attempt RPC");
    }

    const result = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(result.allowed),
      remainingAttempts: Math.max(0, maxAttempts - Number(result.attempts ?? 0)),
      retryAfterSeconds: Number(result.retry_after_seconds ?? 0) || undefined,
    };
  } catch (err: unknown) {
    console.error(
      `[RATE_LIMIT_FAIL_CLOSED] record_failed_rate_limit_attempt service error for key_hash=${keyHash}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: 60,
      error: "RATE_LIMIT_SERVICE_UNAVAILABLE",
    };
  }
}

/**
 * Resets the rate limiter for a key upon successful authentication.
 * Deletes the failure record from PostgreSQL.
 */
export async function resetRateLimit(
  key: string,
  options: { supabaseClient?: SupabaseClient } = {}
): Promise<void> {
  const keyHash = hashRateLimitKey(key);

  try {
    const adminClient = options.supabaseClient ?? createServerAdminClient();
    await (adminClient as unknown as {
      rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
    }).rpc("reset_rate_limit", {
      p_key_hash: keyHash,
    });
  } catch (err: unknown) {
    // Non-fatal if reset fails, but log safely for observability
    console.error(
      `[RATE_LIMIT_RESET_ERROR] reset_rate_limit service error for key_hash=${keyHash}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
