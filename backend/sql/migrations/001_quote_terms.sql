ALTER TABLE insurance_quotes
    ADD COLUMN IF NOT EXISTS trigger_threshold_score INTEGER,
    ADD COLUMN IF NOT EXISTS trigger_emergency_rain_24h INTEGER,
    ADD COLUMN IF NOT EXISTS risk_model_version TEXT,
    ADD COLUMN IF NOT EXISTS premium_lock_wei NUMERIC(78, 0),
    ADD COLUMN IF NOT EXISTS payout_cap_wei NUMERIC(78, 0),
    ADD COLUMN IF NOT EXISTS eth_eur_rate NUMERIC(16, 4),
    ADD COLUMN IF NOT EXISTS rate_source TEXT,
    ADD COLUMN IF NOT EXISTS rate_fetched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS quote_terms_tx_hash TEXT;

-- Existing quotes were created before immutable settlement terms existed. They
-- must not be activated because their financial and trigger parameters cannot
-- be reconstructed safely.
UPDATE insurance_quotes
SET status = 'expired',
    trigger_threshold_score = COALESCE(trigger_threshold_score, 8),
    trigger_emergency_rain_24h = COALESCE(trigger_emergency_rain_24h, 80),
    risk_model_version = COALESCE(risk_model_version, 'legacy'),
    premium_lock_wei = COALESCE(premium_lock_wei, 0),
    payout_cap_wei = COALESCE(payout_cap_wei, 0),
    eth_eur_rate = COALESCE(eth_eur_rate, 0),
    rate_source = COALESCE(rate_source, 'legacy'),
    rate_fetched_at = COALESCE(rate_fetched_at, created_at),
    expires_at = COALESCE(expires_at, NOW() - INTERVAL '1 second')
WHERE premium_lock_wei IS NULL
   OR payout_cap_wei IS NULL
   OR trigger_threshold_score IS NULL
   OR trigger_emergency_rain_24h IS NULL
   OR risk_model_version IS NULL
   OR eth_eur_rate IS NULL
   OR rate_source IS NULL
   OR rate_fetched_at IS NULL
   OR expires_at IS NULL;

ALTER TABLE insurance_quotes
    ALTER COLUMN trigger_threshold_score SET NOT NULL,
    ALTER COLUMN trigger_emergency_rain_24h SET NOT NULL,
    ALTER COLUMN risk_model_version SET NOT NULL,
    ALTER COLUMN premium_lock_wei SET NOT NULL,
    ALTER COLUMN payout_cap_wei SET NOT NULL,
    ALTER COLUMN eth_eur_rate SET NOT NULL,
    ALTER COLUMN rate_source SET NOT NULL,
    ALTER COLUMN rate_fetched_at SET NOT NULL,
    ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_quotes_expiration
    ON insurance_quotes (status, expires_at);
