CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS weather_data (
    id BIGSERIAL PRIMARY KEY,
    location_id TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    rain_1h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rain_24h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    wind_speed NUMERIC(10, 2) NOT NULL DEFAULT 0,
    temperature NUMERIC(10, 2) NOT NULL DEFAULT 0,
    humidity NUMERIC(5, 2) NOT NULL DEFAULT 0,
    weather_type TEXT NOT NULL,
    source TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_data_location_time
    ON weather_data (location_id, "timestamp" DESC);

CREATE TABLE IF NOT EXISTS risk_snapshots (
    id BIGSERIAL PRIMARY KEY,
    weather_data_id BIGINT NOT NULL REFERENCES weather_data(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    season TEXT NOT NULL,
    risk_score INTEGER NOT NULL,
    event_active BOOLEAN NOT NULL DEFAULT FALSE,
    rain_1h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rain_24h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rain_72h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    consecutive_heavy_rain_hours INTEGER NOT NULL DEFAULT 0,
    event_duration_hours INTEGER NOT NULL DEFAULT 0,
    wind_speed NUMERIC(10, 2) NOT NULL DEFAULT 0,
    temperature NUMERIC(10, 2) NOT NULL DEFAULT 0,
    humidity NUMERIC(5, 2) NOT NULL DEFAULT 0,
    weather_type TEXT NOT NULL,
    matched_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation JSONB NOT NULL DEFAULT '[]'::jsonb,
    calculation_version TEXT NOT NULL DEFAULT 'risk-engine:v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (weather_data_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_location_time
    ON risk_snapshots (location_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS risk_events (
    id BIGSERIAL PRIMARY KEY,
    location_id TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    risk_score INTEGER NOT NULL,
    payout_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    rain_72h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    consecutive_heavy_rain_hours INTEGER NOT NULL DEFAULT 0,
    season TEXT NOT NULL,
    trigger_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_location_time
    ON risk_events (location_id, start_time DESC);

CREATE TABLE IF NOT EXISTS locations (
    location_id TEXT PRIMARY KEY,
    location_label TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'geojson',
    geometry GEOMETRY(MultiPolygon, 4326),
    centroid GEOMETRY(Point, 4326) NOT NULL,
    area_hectares NUMERIC(12, 4),
    bbox GEOMETRY(Polygon, 4326),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_geometry
    ON locations USING GIST (geometry);

CREATE INDEX IF NOT EXISTS idx_locations_centroid
    ON locations USING GIST (centroid);

CREATE TABLE IF NOT EXISTS crop_reference (
    crop_type TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    family TEXT NOT NULL,
    expected_yield_t_ha NUMERIC(10, 2) NOT NULL,
    reference_price_eur_t NUMERIC(10, 2) NOT NULL,
    production_cost_eur_ha NUMERIC(10, 2) NOT NULL,
    base_premium_rate NUMERIC(8, 4) NOT NULL,
    reference_season_days INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_requests (
    id BIGSERIAL PRIMARY KEY,
    farmer_address TEXT NOT NULL,
    location_id TEXT NOT NULL REFERENCES locations(location_id) ON DELETE RESTRICT,
    location_label TEXT NOT NULL,
    crop_type TEXT NOT NULL REFERENCES crop_reference(crop_type) ON DELETE RESTRICT,
    area_ha NUMERIC(12, 4) NOT NULL,
    coverage_start TIMESTAMPTZ NOT NULL,
    coverage_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_requests_farmer
    ON insurance_requests (farmer_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_insurance_requests_location
    ON insurance_requests (location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS insurance_quotes (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES insurance_requests(id) ON DELETE CASCADE,
    underwriter_address TEXT NOT NULL DEFAULT 'system',
    status TEXT NOT NULL DEFAULT 'open',
    locked_amount_eth NUMERIC(20, 8),
    capital_lock_tx_hash TEXT,
    risk_tier TEXT NOT NULL,
    severe_events_90d INTEGER NOT NULL DEFAULT 0,
    average_risk_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_risk_score INTEGER NOT NULL DEFAULT 0,
    max_rain_24h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_rain_1h NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_wind_speed NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_temperature NUMERIC(10, 2) NOT NULL DEFAULT 0,
    location_risk_multiplier NUMERIC(8, 4) NOT NULL,
    season_multiplier NUMERIC(8, 4) NOT NULL,
    expected_revenue_per_ha_eur NUMERIC(12, 2) NOT NULL,
    insured_amount_per_ha_eur NUMERIC(12, 2) NOT NULL,
    payout_cap_eur NUMERIC(14, 2) NOT NULL,
    premium_rate NUMERIC(8, 4) NOT NULL,
    premium_amount_eur NUMERIC(14, 2) NOT NULL,
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_quotes_request
    ON insurance_quotes (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS premium_payments (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES insurance_requests(id) ON DELETE CASCADE,
    quote_id BIGINT NOT NULL REFERENCES insurance_quotes(id) ON DELETE CASCADE,
    payer_address TEXT NOT NULL,
    amount_eur NUMERIC(14, 2) NOT NULL,
    amount_eth NUMERIC(20, 8),
    asset TEXT NOT NULL DEFAULT 'EUR',
    transaction_hash TEXT,
    status TEXT NOT NULL DEFAULT 'recorded',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premium_payments_request
    ON premium_payments (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS capital_reservations (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES insurance_requests(id) ON DELETE CASCADE,
    quote_id BIGINT NOT NULL REFERENCES insurance_quotes(id) ON DELETE CASCADE,
    policy_id BIGINT,
    reserved_amount_eur NUMERIC(14, 2) NOT NULL,
    reserved_amount_eth NUMERIC(20, 8),
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_reservations_request
    ON capital_reservations (request_id, created_at DESC);

INSERT INTO crop_reference (
    crop_type,
    display_name,
    family,
    expected_yield_t_ha,
    reference_price_eur_t,
    production_cost_eur_ha,
    base_premium_rate,
    reference_season_days,
    active
)
VALUES
    ('barley', 'Orz', 'cereal', 4.80, 190.00, 520.00, 0.0420, 260, TRUE),
    ('corn', 'Porumb', 'cereal', 7.00, 190.00, 750.00, 0.0580, 180, TRUE),
    ('oats', 'Ovaz', 'cereal', 3.70, 185.00, 450.00, 0.0410, 180, TRUE),
    ('potato', 'Cartof', 'root', 24.00, 150.00, 1600.00, 0.0900, 150, TRUE),
    ('rapeseed', 'Rapita', 'oilseed', 3.10, 420.00, 780.00, 0.0600, 290, TRUE),
    ('soy', 'Soia', 'legume', 2.80, 410.00, 690.00, 0.0570, 170, TRUE),
    ('sunflower', 'Floarea-soarelui', 'oilseed', 2.80, 390.00, 680.00, 0.0560, 170, TRUE),
    ('wheat', 'Grau', 'cereal', 5.20, 210.00, 600.00, 0.0450, 270, TRUE)
ON CONFLICT (crop_type) DO UPDATE
SET display_name = EXCLUDED.display_name,
    family = EXCLUDED.family,
    expected_yield_t_ha = EXCLUDED.expected_yield_t_ha,
    reference_price_eur_t = EXCLUDED.reference_price_eur_t,
    production_cost_eur_ha = EXCLUDED.production_cost_eur_ha,
    base_premium_rate = EXCLUDED.base_premium_rate,
    reference_season_days = EXCLUDED.reference_season_days,
    active = EXCLUDED.active,
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS contracts (
    id BIGINT PRIMARY KEY,
    user_address TEXT NOT NULL,
    underwriter_address TEXT,
    funding_source TEXT NOT NULL DEFAULT 'shared_pool',
    location_id TEXT NOT NULL,
    insurance_request_id BIGINT,
    insurance_quote_id BIGINT,
    location_label TEXT,
    latitude NUMERIC(9, 6) NOT NULL DEFAULT 0,
    longitude NUMERIC(9, 6) NOT NULL DEFAULT 0,
    crop_type TEXT NOT NULL,
    threshold_score INTEGER NOT NULL,
    payout_amount NUMERIC(20, 8) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    emergency_rain_24h INTEGER NOT NULL DEFAULT 80,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    payout_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    last_risk_score INTEGER,
    payout_tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_location_active
    ON contracts (location_id, active);

CREATE TABLE IF NOT EXISTS payout_jobs (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL,
    triggering_snapshot_id BIGINT NOT NULL REFERENCES risk_snapshots(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    tx_hash TEXT,
    report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    trigger_reason TEXT NOT NULL,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (policy_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_jobs_runnable
    ON payout_jobs (status, next_retry_at, priority DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS payout_attempts (
    id BIGSERIAL PRIMARY KEY,
    payout_job_id BIGINT NOT NULL REFERENCES payout_jobs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    outcome TEXT,
    tx_hash TEXT,
    error_code TEXT,
    error_message TEXT,
    rpc_url TEXT,
    gas_price TEXT,
    gas_used TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payout_job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_payout_attempts_job
    ON payout_attempts (payout_job_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS payout_audit (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    payout_job_id BIGINT NOT NULL REFERENCES payout_jobs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_audit_policy
    ON payout_audit (policy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payout_audit_job
    ON payout_audit (payout_job_id, created_at DESC);

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS underwriter_address TEXT;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT 'shared_pool';

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS location_label TEXT;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6) NOT NULL DEFAULT 0;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6) NOT NULL DEFAULT 0;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS insurance_request_id BIGINT;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS insurance_quote_id BIGINT;

ALTER TABLE insurance_quotes
    ADD COLUMN IF NOT EXISTS locked_amount_eth NUMERIC(20, 8);

ALTER TABLE insurance_quotes
    ADD COLUMN IF NOT EXISTS capital_lock_tx_hash TEXT;

ALTER TABLE premium_payments
    ADD COLUMN IF NOT EXISTS amount_eth NUMERIC(20, 8);
