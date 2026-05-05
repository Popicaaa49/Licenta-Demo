import { db } from "../db/pool";

const CONTRACT_SELECT = `SELECT
    c.id,
    c.user_address,
    c.underwriter_address,
    c.funding_source,
    c.location_id,
    c.insurance_request_id,
    c.insurance_quote_id,
    COALESCE(l.location_label, c.location_label) AS location_label,
    COALESCE(ST_Y(l.centroid)::text, c.latitude::text) AS latitude,
    COALESCE(ST_X(l.centroid)::text, c.longitude::text) AS longitude,
    c.crop_type,
    c.threshold_score,
    c.payout_amount,
    c.active,
    c.emergency_rain_24h,
    c.start_time,
    c.end_time,
    c.payout_triggered,
    c.last_risk_score,
    c.payout_tx_hash
  FROM contracts c
  LEFT JOIN locations l ON l.location_id = c.location_id`;

export type ContractRecord = {
  id: string;
  user_address: string;
  underwriter_address: string | null;
  funding_source: string;
  location_id: string;
  insurance_request_id: string | null;
  insurance_quote_id: string | null;
  location_label: string | null;
  latitude: string;
  longitude: string;
  crop_type: string;
  threshold_score: number;
  payout_amount: string;
  active: boolean;
  emergency_rain_24h: number;
  start_time: Date;
  end_time: Date;
  payout_triggered: boolean;
  last_risk_score: number | null;
  payout_tx_hash: string | null;
};

export type CreateContractRecordInput = {
  id: number;
  userAddress: string;
  underwriterAddress?: string | null;
  fundingSource?: string;
  locationId: string;
  insuranceRequestId?: number | null;
  insuranceQuoteId?: number | null;
  locationLabel?: string | null;
  latitude: number;
  longitude: number;
  cropType: string;
  thresholdScore: number;
  payoutAmount: string;
  active: boolean;
  emergencyRain24h: number;
  startTime: Date;
  endTime: Date;
};

type ContractStatusUpdate = {
  active: boolean;
  payoutTriggered: boolean;
  lastRiskScore: number;
  payoutTxHash: string | null;
};

export type TrackedLocationRecord = {
  location_id: string;
  location_label: string | null;
  latitude: string;
  longitude: string;
};

export class ContractRepository {
  async create(input: CreateContractRecordInput) {
    const result = await db.query<ContractRecord>(
      `INSERT INTO contracts (
          id,
          user_address,
          underwriter_address,
          funding_source,
          location_id,
          insurance_request_id,
          insurance_quote_id,
          location_label,
          latitude,
          longitude,
          crop_type,
          threshold_score,
          payout_amount,
          active,
          emergency_rain_24h,
          start_time,
          end_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE
        SET user_address = EXCLUDED.user_address,
            underwriter_address = EXCLUDED.underwriter_address,
            funding_source = EXCLUDED.funding_source,
            location_id = EXCLUDED.location_id,
            insurance_request_id = EXCLUDED.insurance_request_id,
            insurance_quote_id = EXCLUDED.insurance_quote_id,
            location_label = EXCLUDED.location_label,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            crop_type = EXCLUDED.crop_type,
            threshold_score = EXCLUDED.threshold_score,
            payout_amount = EXCLUDED.payout_amount,
            active = EXCLUDED.active,
            emergency_rain_24h = EXCLUDED.emergency_rain_24h,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            updated_at = NOW()
        RETURNING *`,
      [
        input.id,
        input.userAddress,
        input.underwriterAddress ?? null,
        input.fundingSource ?? "shared_pool",
        input.locationId,
        input.insuranceRequestId ?? null,
        input.insuranceQuoteId ?? null,
        input.locationLabel ?? null,
        input.latitude,
        input.longitude,
        input.cropType,
        input.thresholdScore,
        input.payoutAmount,
        input.active,
        input.emergencyRain24h,
        input.startTime,
        input.endTime,
      ]
    );

    return result.rows[0];
  }

  async getById(id: number | string) {
    const result = await db.query<ContractRecord>(
      `${CONTRACT_SELECT}
       WHERE c.id = $1`,
      [id]
    );

    return result.rows[0] ?? null;
  }

  async listAll() {
    const result = await db.query<ContractRecord>(
      `${CONTRACT_SELECT}
       ORDER BY c.id ASC`
    );

    return result.rows;
  }

  async getActiveByLocation(locationId: string, observedAt: Date) {
    const result = await db.query<ContractRecord>(
      `${CONTRACT_SELECT}
       WHERE c.location_id = $1
         AND c.active = TRUE
         AND c.start_time <= $2
         AND c.end_time >= $2
       ORDER BY c.id ASC`,
      [locationId, observedAt]
    );

    return result.rows;
  }

  async listTrackedLocations() {
    const result = await db.query<TrackedLocationRecord>(
      `SELECT DISTINCT ON (c.location_id)
          c.location_id,
          COALESCE(l.location_label, c.location_label) AS location_label,
          COALESCE(ST_Y(l.centroid)::text, c.latitude::text) AS latitude,
          COALESCE(ST_X(l.centroid)::text, c.longitude::text) AS longitude
       FROM contracts c
       LEFT JOIN locations l ON l.location_id = c.location_id
       WHERE c.active = TRUE
       ORDER BY c.location_id, c.updated_at DESC, c.id DESC`
    );

    return result.rows;
  }

  async updateStatus(id: number | string, update: ContractStatusUpdate) {
    const result = await db.query<ContractRecord>(
      `UPDATE contracts
       SET active = $2,
           payout_triggered = $3,
           last_risk_score = $4,
           payout_tx_hash = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, update.active, update.payoutTriggered, update.lastRiskScore, update.payoutTxHash]
    );

    return result.rows[0] ?? null;
  }

  async updateMonitoringState(id: number | string, lastRiskScore: number) {
    const result = await db.query<ContractRecord>(
      `UPDATE contracts
       SET last_risk_score = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, lastRiskScore]
    );

    return result.rows[0] ?? null;
  }
}
