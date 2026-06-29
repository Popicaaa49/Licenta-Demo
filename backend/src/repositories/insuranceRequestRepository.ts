import { db } from "../db/pool";
import {
  InsuranceRequestRecord,
  InsuranceRequestWithQuoteRecord,
  mapInsuranceRequestRecord,
  mapInsuranceRequestWithQuoteRecord,
} from "../types/underwriting";

export type CreateInsuranceRequestInput = {
  farmerAddress: string;
  locationId: string;
  locationLabel: string;
  cropType: string;
  areaHa: number;
  coverageStart: Date;
  coverageEnd: Date;
  status: string;
};

const requestWithRelationsQuery = `
  SELECT
      r.*,
      q.id AS quote_id,
      q.status AS quote_status,
      q.locked_amount_eth,
      q.capital_lock_tx_hash,
      q.risk_tier,
      q.severe_events_90d,
      q.average_risk_score,
      q.max_risk_score,
      q.max_rain_24h,
      q.max_rain_1h,
      q.max_wind_speed,
      q.max_temperature,
      q.location_risk_multiplier,
      q.season_multiplier,
      q.expected_revenue_per_ha_eur,
      q.insured_amount_per_ha_eur,
      q.payout_cap_eur,
      q.premium_rate,
      q.premium_amount_eur,
      q.trigger_threshold_score,
      q.trigger_emergency_rain_24h,
      q.risk_model_version,
      q.expires_at,
      q.breakdown,
      q.created_at AS quote_created_at,
      q.updated_at AS quote_updated_at,
      q.underwriter_address,
      s.id AS settlement_id,
      s.status AS settlement_status,
      s.underwriter_address AS settlement_underwriter_address,
      s.premium_lock_wei AS settlement_premium_lock_wei,
      s.payout_cap_wei AS settlement_payout_cap_wei,
      s.eth_eur_rate AS settlement_eth_eur_rate,
      s.rate_source AS settlement_rate_source,
      s.rate_fetched_at AS settlement_rate_fetched_at,
      s.expires_at AS settlement_expires_at,
      s.terms_tx_hash AS settlement_terms_tx_hash,
      s.created_at AS settlement_created_at,
      s.updated_at AS settlement_updated_at,
      p.id AS payment_id,
      p.settlement_id AS payment_settlement_id,
      p.status AS payment_status,
      p.payer_address AS payment_payer_address,
      p.amount_eur AS payment_amount_eur,
      p.amount_eth AS payment_amount_eth,
      p.asset AS payment_asset,
      p.transaction_hash AS payment_transaction_hash,
      p.created_at AS payment_created_at,
      cr.id AS reservation_id,
      cr.settlement_id AS reservation_settlement_id,
      cr.status AS reservation_status,
      cr.policy_id AS reservation_policy_id,
      cr.reserved_amount_eur,
      cr.reserved_amount_eth,
      cr.created_at AS reservation_created_at,
      cr.updated_at AS reservation_updated_at
   FROM insurance_requests r
   LEFT JOIN LATERAL (
      SELECT *
      FROM insurance_quotes q
      WHERE q.request_id = r.id
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT 1
   ) q ON TRUE
   LEFT JOIN LATERAL (
      SELECT *
      FROM quote_settlements s
      WHERE s.quote_id = q.id
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 1
   ) s ON TRUE
   LEFT JOIN LATERAL (
      SELECT *
      FROM premium_payments p
      WHERE p.settlement_id = s.id
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 1
   ) p ON TRUE
   LEFT JOIN LATERAL (
      SELECT *
      FROM capital_reservations cr
      WHERE cr.settlement_id = s.id
      ORDER BY cr.created_at DESC, cr.id DESC
      LIMIT 1
   ) cr ON TRUE`;

export class InsuranceRequestRepository {
  async create(input: CreateInsuranceRequestInput) {
    const result = await db.query<InsuranceRequestRecord>(
      `INSERT INTO insurance_requests (
          farmer_address,
          location_id,
          location_label,
          crop_type,
          area_ha,
          coverage_start,
          coverage_end,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
      [
        input.farmerAddress,
        input.locationId,
        input.locationLabel,
        input.cropType,
        input.areaHa,
        input.coverageStart,
        input.coverageEnd,
        input.status,
      ]
    );

    return mapInsuranceRequestRecord(result.rows[0]);
  }

  async listAllWithLatestQuote() {
    const result = await db.query<InsuranceRequestWithQuoteRecord>(
      `${requestWithRelationsQuery}
       ORDER BY r.created_at DESC, r.id DESC`
    );

    return result.rows.map(mapInsuranceRequestWithQuoteRecord);
  }

  async getByIdWithLatestQuote(id: number) {
    const result = await db.query<InsuranceRequestWithQuoteRecord>(
      `${requestWithRelationsQuery}
       WHERE r.id = $1
       LIMIT 1`,
      [id]
    );

    return result.rows[0] ? mapInsuranceRequestWithQuoteRecord(result.rows[0]) : null;
  }

  async updateStatus(id: number, status: string) {
    const result = await db.query<InsuranceRequestRecord>(
      `UPDATE insurance_requests
       SET status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );

    return result.rows[0] ? mapInsuranceRequestRecord(result.rows[0]) : null;
  }
}
