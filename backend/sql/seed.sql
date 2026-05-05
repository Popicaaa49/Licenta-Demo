INSERT INTO locations (
    location_id,
    location_label,
    source_type,
    geometry,
    centroid,
    area_hectares,
    bbox,
    metadata
) VALUES
    (
        'loc-45_74890-21_20870',
        'Timis Demo Farm',
        'seed_point',
        NULL,
        ST_SetSRID(ST_MakePoint(21.208700, 45.748900), 4326),
        NULL,
        NULL,
        '{"seed": true, "county": "Timis"}'::jsonb
    ),
    (
        'loc-47_04650-21_91890',
        'Bihor Demo Farm',
        'seed_point',
        NULL,
        ST_SetSRID(ST_MakePoint(21.918900, 47.046500), 4326),
        NULL,
        NULL,
        '{"seed": true, "county": "Bihor"}'::jsonb
    )
ON CONFLICT (location_id) DO NOTHING;

INSERT INTO contracts (
    id,
    user_address,
    location_id,
    location_label,
    latitude,
    longitude,
    crop_type,
    threshold_score,
    payout_amount,
    active,
    emergency_rain_24h,
    start_time,
    end_time,
    payout_triggered,
    last_risk_score
) VALUES
    (
        0,
        '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        'loc-45_74890-21_20870',
        'Timis Demo Farm',
        45.748900,
        21.208700,
        'wheat',
        8,
        1.25000000,
        TRUE,
        80,
        '2026-07-01T00:00:00Z',
        '2026-07-31T23:59:59Z',
        FALSE,
        NULL
    ),
    (
        1,
        '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
        'loc-47_04650-21_91890',
        'Bihor Demo Farm',
        47.046500,
        21.918900,
        'corn',
        8,
        1.75000000,
        TRUE,
        80,
        '2026-07-01T00:00:00Z',
        '2026-07-31T23:59:59Z',
        FALSE,
        NULL
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO weather_data (
    location_id,
    "timestamp",
    rain_1h,
    rain_24h,
    wind_speed,
    temperature,
    humidity,
    weather_type,
    source,
    raw_payload
) VALUES
    (
        'loc-45_74890-21_20870',
        '2026-07-15T08:00:00Z',
        8,
        18,
        10,
        30,
        74,
        'rain',
        'seed',
        '{"demo": true}'::jsonb
    ),
    (
        'loc-45_74890-21_20870',
        '2026-07-15T09:00:00Z',
        25,
        43,
        18,
        36,
        92,
        'thunderstorm',
        'seed',
        '{"demo": true}'::jsonb
    ),
    (
        'loc-47_04650-21_91890',
        '2026-07-15T09:00:00Z',
        4,
        9,
        7,
        28,
        61,
        'clouds',
        'seed',
        '{"demo": true}'::jsonb
    );

INSERT INTO risk_events (
    location_id,
    start_time,
    end_time,
    risk_score,
    payout_triggered,
    rain_72h,
    consecutive_heavy_rain_hours,
    season,
    trigger_reasons
) VALUES
    (
        'loc-45_74890-21_20870',
        '2026-07-15T09:00:00Z',
        '2026-07-15T09:00:00Z',
        8,
        TRUE,
        51,
        1,
        'summer',
        '["rain_24h_gt_40","rain_1h_gt_20","thunderstorm","wind_gt_15","temp_gt_35"]'::jsonb
    )
ON CONFLICT DO NOTHING;
