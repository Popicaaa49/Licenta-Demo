import { db } from "../db/pool";
import {
  InsuranceQuoteRecord,
  mapInsuranceQuoteRecord,
} from "../types/underwriting";

export type CreateInsuranceQuoteInput = {
  requestId: number;
  underwriterAddress: string;
  status: string;
  lockedAmountEth?: string | null;
  capitalLockTxHash?: string | null;
  riskTier: string;
  severeEvents90d: number;
  averageRiskScore: number;
  maxRiskScore: number;
  maxRain24h: number;
  maxRain1h: number;
  maxWindSpeed: number;
  maxTemperature: number;
  locationRiskMultiplier: number;
  seasonMultiplier: number;
  expectedRevenuePerHaEur: number;
  insuredAmountPerHaEur: number;
  payoutCapEur: number;
  premiumRate: number;
  premiumAmountEur: number;
  triggerThresholdScore: number;
  triggerEmergencyRain24h: number;
  riskModelVersion: string;
  expiresAt: Date;
  breakdown: Record<string, unknown>;
};

export class InsuranceQuoteRepository {
  async create(input: CreateInsuranceQuoteInput) {
    const result = await db.query<InsuranceQuoteRecord>(
      `INSERT INTO insurance_quotes (
          request_id,
          underwriter_address,
          status,
          locked_amount_eth,
          capital_lock_tx_hash,
          risk_tier,
          severe_events_90d,
          average_risk_score,
          max_risk_score,
          max_rain_24h,
          max_rain_1h,
          max_wind_speed,
          max_temperature,
          location_risk_multiplier,
          season_multiplier,
          expected_revenue_per_ha_eur,
          insured_amount_per_ha_eur,
          payout_cap_eur,
          premium_rate,
          premium_amount_eur,
          trigger_threshold_score,
          trigger_emergency_rain_24h,
          risk_model_version,
          expires_at,
          breakdown
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb
        )
        RETURNING *`,
      [
        input.requestId,
        input.underwriterAddress,
        input.status,
        input.lockedAmountEth ?? null,
        input.capitalLockTxHash ?? null,
        input.riskTier,
        input.severeEvents90d,
        input.averageRiskScore,
        input.maxRiskScore,
        input.maxRain24h,
        input.maxRain1h,
        input.maxWindSpeed,
        input.maxTemperature,
        input.locationRiskMultiplier,
        input.seasonMultiplier,
        input.expectedRevenuePerHaEur,
        input.insuredAmountPerHaEur,
        input.payoutCapEur,
        input.premiumRate,
        input.premiumAmountEur,
        input.triggerThresholdScore,
        input.triggerEmergencyRain24h,
        input.riskModelVersion,
        input.expiresAt,
        JSON.stringify(input.breakdown),
      ]
    );

    return mapInsuranceQuoteRecord(result.rows[0]);
  }

  async getLatestByRequestId(requestId: number) {
    const result = await db.query<InsuranceQuoteRecord>(
      `SELECT *
       FROM insurance_quotes
       WHERE request_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [requestId]
    );

    return result.rows[0] ? mapInsuranceQuoteRecord(result.rows[0]) : null;
  }

  async updateStatus(id: number, status: string) {
    const result = await db.query<InsuranceQuoteRecord>(
      `UPDATE insurance_quotes
       SET status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );

    return result.rows[0] ? mapInsuranceQuoteRecord(result.rows[0]) : null;
  }

  async updateCapitalLock(input: {
    id: number;
    underwriterAddress: string;
    status: string;
    lockedAmountEth: string | null;
    capitalLockTxHash: string | null;
  }) {
    const result = await db.query<InsuranceQuoteRecord>(
      `UPDATE insurance_quotes
       SET underwriter_address = $2,
           status = $3,
           locked_amount_eth = $4,
           capital_lock_tx_hash = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        input.id,
        input.underwriterAddress,
        input.status,
        input.lockedAmountEth,
        input.capitalLockTxHash,
      ]
    );

    return result.rows[0] ? mapInsuranceQuoteRecord(result.rows[0]) : null;
  }
}
