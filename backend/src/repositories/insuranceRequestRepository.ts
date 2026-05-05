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
      `SELECT
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
          q.breakdown,
          q.created_at AS quote_created_at,
          q.updated_at AS quote_updated_at,
          q.underwriter_address,
          p.id AS payment_id,
          p.status AS payment_status,
          p.payer_address AS payment_payer_address,
          p.amount_eur AS payment_amount_eur,
          p.amount_eth AS payment_amount_eth,
          p.asset AS payment_asset,
          p.transaction_hash AS payment_transaction_hash,
          p.created_at AS payment_created_at,
          cr.id AS reservation_id,
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
          FROM premium_payments p
          WHERE p.request_id = r.id
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT 1
       ) p ON TRUE
       LEFT JOIN LATERAL (
          SELECT *
          FROM capital_reservations cr
          WHERE cr.request_id = r.id
          ORDER BY cr.created_at DESC, cr.id DESC
          LIMIT 1
       ) cr ON TRUE
       ORDER BY r.created_at DESC, r.id DESC`
    );

    return result.rows.map(mapInsuranceRequestWithQuoteRecord);
  }

  async getByIdWithLatestQuote(id: number) {
    const result = await db.query<InsuranceRequestWithQuoteRecord>(
      `SELECT
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
          q.breakdown,
          q.created_at AS quote_created_at,
          q.updated_at AS quote_updated_at,
          q.underwriter_address,
          p.id AS payment_id,
          p.status AS payment_status,
          p.payer_address AS payment_payer_address,
          p.amount_eur AS payment_amount_eur,
          p.amount_eth AS payment_amount_eth,
          p.asset AS payment_asset,
          p.transaction_hash AS payment_transaction_hash,
          p.created_at AS payment_created_at,
          cr.id AS reservation_id,
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
          FROM premium_payments p
          WHERE p.request_id = r.id
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT 1
       ) p ON TRUE
       LEFT JOIN LATERAL (
          SELECT *
          FROM capital_reservations cr
          WHERE cr.request_id = r.id
          ORDER BY cr.created_at DESC, cr.id DESC
          LIMIT 1
       ) cr ON TRUE
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
