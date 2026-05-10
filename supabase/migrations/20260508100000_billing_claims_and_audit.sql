-- Part 2: billing_claims, billing_audit_log, handle_payment_failed guard
--
-- billing_claims:    stamped at checkout creation; /success page polls this to avoid
--                    the race window between Stripe redirect and webhook arrival.
-- billing_audit_log: append-only record of every subscription status change with its
--                    Stripe event ID — used for idempotency and privilege-escalation
--                    detection queries.
-- handle_payment_failed: atomic guard that prevents a failed recurring invoice from
--                    downgrading a lifetime user (the "Lifetime Overwrite" failure mode).

-- ── billing_claims ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_claims (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expected_plan TEXT       NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'confirmed', 'expired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

ALTER TABLE billing_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_claims" ON billing_claims;
CREATE POLICY "users_own_claims" ON billing_claims
  FOR ALL USING (auth.uid() = user_id);

-- ── billing_audit_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status      TEXT        NOT NULL,
  triggered_by    TEXT        NOT NULL, -- Stripe event ID, or 'manual'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is write-only from the client's perspective:
-- users may read their own rows, but only service_role writes.
ALTER TABLE billing_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_audit" ON billing_audit_log;
CREATE POLICY "users_read_own_audit" ON billing_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- ── handle_payment_failed ─────────────────────────────────────────────────────
-- Called by the stripe-webhook Edge Function for invoice.payment_failed events.
-- Guard: lifetime users are never downgraded by a failed recurring invoice.
-- Status vocabulary matches the existing constraint: trial | active | expired | lifetime.
CREATE OR REPLACE FUNCTION handle_payment_failed(
  p_stripe_customer_id TEXT,
  p_stripe_event_id    TEXT
)
RETURNS VOID AS $$
DECLARE
  v_user_id        UUID;
  v_current_status TEXT;
BEGIN
  SELECT id, subscription_status
  INTO   v_user_id, v_current_status
  FROM   profiles
  WHERE  stripe_customer_id = p_stripe_customer_id;

  IF NOT FOUND THEN
    RAISE WARNING 'handle_payment_failed: no profile for customer %', p_stripe_customer_id;
    RETURN;
  END IF;

  -- Guard: only downgrade recoverable statuses.
  -- lifetime users cannot be downgraded by a payment failure.
  IF v_current_status = 'lifetime' THEN
    RAISE NOTICE 'handle_payment_failed: skipping downgrade for % on user %',
      v_current_status, v_user_id;
    RETURN;
  END IF;

  UPDATE profiles
  SET    subscription_status = 'expired',
         billing_period      = NULL,
         subscription_period_end = NULL
  WHERE  id = v_user_id;

  INSERT INTO billing_audit_log (user_id, previous_status, new_status, triggered_by)
  VALUES (v_user_id, v_current_status, 'expired', p_stripe_event_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only callable by service_role (Edge Functions with SUPABASE_SERVICE_ROLE_KEY).
REVOKE ALL ON FUNCTION handle_payment_failed(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION handle_payment_failed(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION handle_payment_failed(TEXT, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION handle_payment_failed(TEXT, TEXT) TO service_role;
