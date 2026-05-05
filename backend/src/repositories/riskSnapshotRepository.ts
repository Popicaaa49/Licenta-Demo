import { db } from "../db/pool";
import {
  CreateRiskSnapshotInput,
  mapRiskSnapshotRecord,
  RiskSnapshotRecord,
} from "../types/riskSnapshot";

export class RiskSnapshotRepository {
  async save(input: CreateRiskSnapshotInput) {
    const result = await db.query<RiskSnapshotRecord>(
      `INSERT INTO risk_snapshots (
          weather_data_id,
          location_id,
          observed_at,
          season,
          risk_score,
          event_active,
          rain_1h,
          rain_24h,
          rain_72h,
          consecutive_heavy_rain_hours,
          event_duration_hours,
          wind_speed,
          temperature,
          humidity,
          weather_type,
          matched_rules,
          explanation,
          calculation_version
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18
        )
        ON CONFLICT (weather_data_id) DO UPDATE
        SET location_id = EXCLUDED.location_id,
            observed_at = EXCLUDED.observed_at,
            season = EXCLUDED.season,
            risk_score = EXCLUDED.risk_score,
            event_active = EXCLUDED.event_active,
            rain_1h = EXCLUDED.rain_1h,
            rain_24h = EXCLUDED.rain_24h,
            rain_72h = EXCLUDED.rain_72h,
            consecutive_heavy_rain_hours = EXCLUDED.consecutive_heavy_rain_hours,
            event_duration_hours = EXCLUDED.event_duration_hours,
            wind_speed = EXCLUDED.wind_speed,
            temperature = EXCLUDED.temperature,
            humidity = EXCLUDED.humidity,
            weather_type = EXCLUDED.weather_type,
            matched_rules = EXCLUDED.matched_rules,
            explanation = EXCLUDED.explanation,
            calculation_version = EXCLUDED.calculation_version
        RETURNING *`,
      [
        input.weatherDataId,
        input.locationId,
        input.observedAt,
        input.season,
        input.riskScore,
        input.eventActive,
        input.rain1h,
        input.rain24h,
        input.rain72h,
        input.consecutiveHeavyRainHours,
        input.eventDurationHours,
        input.windSpeed,
        input.temperature,
        input.humidity,
        input.weatherType,
        JSON.stringify(input.matchedRules),
        JSON.stringify(input.explanation),
        input.calculationVersion ?? "risk-engine:v1",
      ]
    );

    return mapRiskSnapshotRecord(result.rows[0]);
  }

  async getLatest(locationId: string) {
    const result = await db.query<RiskSnapshotRecord>(
      `SELECT *
       FROM risk_snapshots
       WHERE location_id = $1
       ORDER BY observed_at DESC, id DESC
       LIMIT 1`,
      [locationId]
    );

    return result.rows[0] ? mapRiskSnapshotRecord(result.rows[0]) : null;
  }

  async listLatestByLocations(locationIds: string[]) {
    if (locationIds.length === 0) {
      return [];
    }

    const result = await db.query<RiskSnapshotRecord>(
      `SELECT DISTINCT ON (location_id) *
       FROM risk_snapshots
       WHERE location_id = ANY($1::text[])
       ORDER BY location_id, observed_at DESC, id DESC`,
      [locationIds]
    );

    return result.rows.map(mapRiskSnapshotRecord);
  }

  async listHistory(locationId: string, limit: number) {
    const result = await db.query<RiskSnapshotRecord>(
      `SELECT *
       FROM risk_snapshots
       WHERE location_id = $1
       ORDER BY observed_at DESC, id DESC
       LIMIT $2`,
      [locationId, limit]
    );

    return result.rows.map(mapRiskSnapshotRecord);
  }

  async listAfterId(locationIds: string[], afterId: number, limit = 100) {
    if (locationIds.length === 0) {
      return [];
    }

    const result = await db.query<RiskSnapshotRecord>(
      `SELECT *
       FROM risk_snapshots
       WHERE location_id = ANY($1::text[])
         AND id > $2
       ORDER BY id ASC
       LIMIT $3`,
      [locationIds, afterId, limit]
    );

    return result.rows.map(mapRiskSnapshotRecord);
  }
}
