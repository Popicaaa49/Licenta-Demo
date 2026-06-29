import { db } from "../db/pool";
import {
  CapitalReservationRecord,
  mapCapitalReservationRecord,
} from "../types/underwriting";

export type CreateCapitalReservationInput = {
  requestId: number;
  quoteId: number;
  settlementId: number;
  policyId?: number | null;
  reservedAmountEur: number;
  reservedAmountEth?: string | null;
  status: string;
};

export class CapitalReservationRepository {
  async create(input: CreateCapitalReservationInput) {
    const result = await db.query<CapitalReservationRecord>(
      `INSERT INTO capital_reservations (
          request_id,
          quote_id,
          settlement_id,
          policy_id,
          reserved_amount_eur,
          reserved_amount_eth,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
      [
        input.requestId,
        input.quoteId,
        input.settlementId,
        input.policyId ?? null,
        input.reservedAmountEur,
        input.reservedAmountEth ?? null,
        input.status,
      ]
    );

    return mapCapitalReservationRecord(result.rows[0]);
  }

  async updateForPolicy(input: {
    settlementId: number;
    policyId: number;
    status: string;
  }) {
    const result = await db.query<CapitalReservationRecord>(
      `UPDATE capital_reservations
       SET policy_id = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = (
         SELECT id
         FROM capital_reservations
         WHERE settlement_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       )
       RETURNING *`,
      [input.settlementId, input.policyId, input.status]
    );

    return result.rows[0] ? mapCapitalReservationRecord(result.rows[0]) : null;
  }

  async updateStatusBySettlementId(input: { settlementId: number; status: string }) {
    const result = await db.query<CapitalReservationRecord>(
      `UPDATE capital_reservations
       SET status = $2,
           updated_at = NOW()
       WHERE id = (
         SELECT id
         FROM capital_reservations
         WHERE settlement_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       )
       RETURNING *`,
      [input.settlementId, input.status]
    );

    return result.rows[0] ? mapCapitalReservationRecord(result.rows[0]) : null;
  }
}
