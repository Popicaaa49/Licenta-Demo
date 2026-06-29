-- Commercial quotes are expressed in EUR. ETH conversion terms belong to a
-- short-lived settlement session, not to the commercial quote itself.
ALTER TABLE insurance_quotes
    ALTER COLUMN premium_lock_wei DROP NOT NULL,
    ALTER COLUMN payout_cap_wei DROP NOT NULL,
    ALTER COLUMN eth_eur_rate DROP NOT NULL,
    ALTER COLUMN rate_source DROP NOT NULL,
    ALTER COLUMN rate_fetched_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS quote_settlements (
    id BIGSERIAL PRIMARY KEY,
    quote_id BIGINT NOT NULL REFERENCES insurance_quotes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'prepared',
    underwriter_address TEXT,
    premium_lock_wei NUMERIC(78, 0) NOT NULL,
    payout_cap_wei NUMERIC(78, 0) NOT NULL,
    eth_eur_rate NUMERIC(16, 4) NOT NULL,
    rate_source TEXT NOT NULL,
    rate_fetched_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    terms_tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_settlements_quote
    ON quote_settlements (quote_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_settlements_expiration
    ON quote_settlements (status, expires_at);

ALTER TABLE premium_payments
    ADD COLUMN IF NOT EXISTS settlement_id BIGINT REFERENCES quote_settlements(id) ON DELETE RESTRICT;

ALTER TABLE capital_reservations
    ADD COLUMN IF NOT EXISTS settlement_id BIGINT REFERENCES quote_settlements(id) ON DELETE RESTRICT;
