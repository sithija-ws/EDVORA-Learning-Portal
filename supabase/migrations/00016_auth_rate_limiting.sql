-- ============================================================================
-- Migration: 00016_auth_rate_limiting.sql
-- Description: Serverless-safe, atomic PostgreSQL-backed rate limiter for
--              authentication endpoints. Defends against distributed brute-force
--              and credential-stuffing attacks across concurrent Vercel instances.
-- Status: PREPARED ONLY (DO NOT APPLY UNTIL APPROVED)
-- ============================================================================

-- ─── 1. AUTH RATE LIMITS TABLE ───────────────────────────────────────────────
-- Stores hashed rate limit keys with window tracking and temporary lockout states.
-- Raw IP addresses and raw usernames are never stored; only cryptographic hashes.

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key_hash     TEXT        PRIMARY KEY,
  attempts     INT         NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.auth_rate_limits              IS 'Atomic rate-limiting state table for authentication abuse prevention.';
COMMENT ON COLUMN public.auth_rate_limits.key_hash     IS 'SHA-256 digest of normalized client identifier and target account.';
COMMENT ON COLUMN public.auth_rate_limits.attempts     IS 'Failed attempt count within the active window.';
COMMENT ON COLUMN public.auth_rate_limits.window_start IS 'Timestamp when the active rate-limit window began.';
COMMENT ON COLUMN public.auth_rate_limits.locked_until IS 'Timestamp until which authentication is blocked; NULL if not locked.';
COMMENT ON COLUMN public.auth_rate_limits.updated_at   IS 'Timestamp of last update for cleanup pruning.';

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated_at
  ON public.auth_rate_limits (updated_at);

-- ─── 2. CHECK RATE LIMIT FUNCTION ─────────────────────────────────────────────
-- Read-only check performed prior to password hashing to prevent resource exhaustion.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key_hash TEXT,
  p_max_attempts INT DEFAULT 5,
  p_window_seconds INT DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining_attempts INT,
  retry_after_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_record public.auth_rate_limits%ROWTYPE;
  v_retry_after INT := 0;
BEGIN
  SELECT * INTO v_record
  FROM public.auth_rate_limits
  WHERE key_hash = p_key_hash;

  -- Unknown key: allowed with full remaining attempts
  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, p_max_attempts, 0;
    RETURN;
  END IF;

  -- Active lockout check
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_record.locked_until - v_now)))::INT;
    RETURN QUERY SELECT FALSE, 0, v_retry_after;
    RETURN;
  END IF;

  -- Window expiry check: if window expired, treat as fresh
  IF v_now - v_record.window_start > (p_window_seconds || ' seconds')::INTERVAL THEN
    RETURN QUERY SELECT TRUE, p_max_attempts, 0;
    RETURN;
  END IF;

  -- Threshold check within active window
  IF v_record.attempts >= p_max_attempts THEN
    RETURN QUERY SELECT FALSE, 0, COALESCE(CEIL(EXTRACT(EPOCH FROM (v_record.locked_until - v_now)))::INT, p_window_seconds);
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, GREATEST(0, p_max_attempts - v_record.attempts), 0;
END;
$$;

-- ─── 3. RECORD FAILED ATTEMPT FUNCTION ───────────────────────────────────────
-- Uses atomic INSERT ... ON CONFLICT DO UPDATE to completely eliminate concurrency
-- initialization races. Concurrent requests for a new key are serialized by PostgreSQL
-- unique index locking without throwing unique_violation errors.

CREATE OR REPLACE FUNCTION public.record_failed_rate_limit_attempt(
  p_key_hash TEXT,
  p_max_attempts INT DEFAULT 5,
  p_window_seconds INT DEFAULT 60,
  p_lockout_seconds INT DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  attempts INT,
  retry_after_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_record public.auth_rate_limits%ROWTYPE;
  v_retry_after INT := 0;
BEGIN
  -- Probabilistic cleanup (approx. 5% of executions) of stale entries older than 2 hours
  IF random() < 0.05 THEN
    DELETE FROM public.auth_rate_limits
    WHERE updated_at < v_now - INTERVAL '2 hours';
  END IF;

  -- Atomic Upsert with row-locking concurrency handling:
  -- Guarantees atomic insertion if key does not exist, or atomic row update if it does.
  INSERT INTO public.auth_rate_limits (
    key_hash,
    attempts,
    window_start,
    locked_until,
    updated_at
  )
  VALUES (
    p_key_hash,
    1,
    v_now,
    CASE WHEN 1 >= p_max_attempts THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL ELSE NULL END,
    v_now
  )
  ON CONFLICT (key_hash) DO UPDATE
  SET attempts = CASE
        -- If currently locked out, maintain attempt counter or increment
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.attempts + 1
        -- If window expired, reset counter to 1
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN 1
        -- Within active window: increment attempts
        ELSE public.auth_rate_limits.attempts + 1
      END,
      window_start = CASE
        -- If currently locked out, maintain active window start
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.window_start
        -- If window expired, start new window
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN v_now
        -- Otherwise maintain existing window start
        ELSE public.auth_rate_limits.window_start
      END,
      locked_until = CASE
        -- If already locked out, preserve existing lockout expiration
        WHEN public.auth_rate_limits.locked_until IS NOT NULL AND public.auth_rate_limits.locked_until > v_now
          THEN public.auth_rate_limits.locked_until
        -- If window expired, new attempt has not reached threshold (unless p_max_attempts <= 1)
        WHEN v_now - public.auth_rate_limits.window_start > (p_window_seconds || ' seconds')::INTERVAL
          THEN CASE WHEN 1 >= p_max_attempts THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL ELSE NULL END
        -- If increment pushes attempts to or past max_attempts, set lockout
        WHEN (public.auth_rate_limits.attempts + 1) >= p_max_attempts
          THEN v_now + (p_lockout_seconds || ' seconds')::INTERVAL
        ELSE NULL
      END,
      updated_at = v_now
  RETURNING * INTO v_record;

  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_record.locked_until - v_now)))::INT;
    RETURN QUERY SELECT FALSE, v_record.attempts, v_retry_after;
  ELSE
    RETURN QUERY SELECT TRUE, v_record.attempts, 0;
  END IF;
END;
$$;

-- ─── 4. RESET RATE LIMIT FUNCTION ─────────────────────────────────────────────
-- Called upon successful authentication to clear failure records for an account.
-- Concurrency note: If a concurrent failed attempt runs at the exact same instant as reset,
-- PostgreSQL executes DELETE and INSERT/UPDATE serially via row locking. If DELETE commits first,
-- the failed attempt re-inserts 1 attempt; if INSERT commits first, DELETE removes it.
-- In either scenario, database consistency is preserved without deadlocks.

CREATE OR REPLACE FUNCTION public.reset_rate_limit(p_key_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.auth_rate_limits
  WHERE key_hash = p_key_hash;
END;
$$;

-- ─── 5. SECURITY GRANTS & ACCESS RESTRICTIONS ────────────────────────────────
-- The table and functions are shielded entirely from public, anon, and authenticated users.
-- Only the service_role (used by server actions via server admin client) is granted access.

REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_failed_rate_limit_attempt(TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_rate_limit_attempt(TEXT, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_rate_limit(TEXT) TO service_role;
