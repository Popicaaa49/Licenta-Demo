import { db } from "../db/pool";

export type RiskEventRecord = {
  id: string;
  location_id: string;
  start_time: Date;
  end_time: Date | null;
  risk_score: number;
  payout_triggered: boolean;
  rain_72h: string;
  consecutive_heavy_rain_hours: number;
  season: string;
  trigger_reasons: string[];
};

export type UpsertRiskEventInput = {
  id?: string;
  locationId: string;
  startTime: Date;
  endTime: Date | null;
  riskScore: number;
  payoutTriggered: boolean;
  rain72h: number;
  consecutiveHeavyRainHours: number;
  season: string;
  triggerReasons: string[];
};

export class RiskEventRepository {
  async getOpenEvent(locationId: string) {
    const result = await db.query<RiskEventRecord>(
      `SELECT *
       FROM risk_events
       WHERE location_id = $1
         AND end_time IS NULL
       ORDER BY start_time DESC
       LIMIT 1`,
      [locationId]
    );

    return result.rows[0] ?? null;
  }

  async getLatestEvent(locationId: string) {
    const result = await db.query<RiskEventRecord>(
      `SELECT *
       FROM risk_events
       WHERE location_id = $1
       ORDER BY COALESCE(end_time, start_time) DESC
       LIMIT 1`,
      [locationId]
    );

    return result.rows[0] ?? null;
  }

  async save(input: UpsertRiskEventInput) {
    if (input.id) {
      const result = await db.query<RiskEventRecord>(
        `UPDATE risk_events
         SET start_time = $2,
             end_time = $3,
             risk_score = $4,
             payout_triggered = $5,
             rain_72h = $6,
             consecutive_heavy_rain_hours = $7,
             season = $8,
             trigger_reasons = $9::jsonb,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          input.id,
          input.startTime,
          input.endTime,
          input.riskScore,
          input.payoutTriggered,
          input.rain72h,
          input.consecutiveHeavyRainHours,
          input.season,
          JSON.stringify(input.triggerReasons),
        ]
      );

      return result.rows[0];
    }

    const result = await db.query<RiskEventRecord>(
      `INSERT INTO risk_events (
          location_id,
          start_time,
          end_time,
          risk_score,
          payout_triggered,
          rain_72h,
          consecutive_heavy_rain_hours,
          season,
          trigger_reasons
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING *`,
      [
        input.locationId,
        input.startTime,
        input.endTime,
        input.riskScore,
        input.payoutTriggered,
        input.rain72h,
        input.consecutiveHeavyRainHours,
        input.season,
        JSON.stringify(input.triggerReasons),
      ]
    );

    return result.rows[0];
  }
}
