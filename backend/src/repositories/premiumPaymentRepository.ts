import { db } from "../db/pool";
import {
  PremiumPaymentRecord,
  mapPremiumPaymentRecord,
} from "../types/underwriting";

export type CreatePremiumPaymentInput = {
  requestId: number;
  quoteId: number;
  settlementId: number;
  payerAddress: string;
  amountEur: number;
  amountEth?: string | null;
  asset: string;
  transactionHash?: string | null;
  status: string;
};

export class PremiumPaymentRepository {
  async create(input: CreatePremiumPaymentInput) {
    const result = await db.query<PremiumPaymentRecord>(
      `INSERT INTO premium_payments (
          request_id,
          quote_id,
          settlement_id,
          payer_address,
          amount_eur,
          amount_eth,
          asset,
          transaction_hash,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
      [
        input.requestId,
        input.quoteId,
        input.settlementId,
        input.payerAddress,
        input.amountEur,
        input.amountEth ?? null,
        input.asset,
        input.transactionHash ?? null,
        input.status,
      ]
    );

    return mapPremiumPaymentRecord(result.rows[0]);
  }

  async updateLatestBySettlementId(input: {
    settlementId: number;
    status: string;
    transactionHash?: string | null;
    amountEth?: string | null;
    asset?: string;
  }) {
    const result = await db.query<PremiumPaymentRecord>(
      `UPDATE premium_payments
       SET status = $2,
           transaction_hash = COALESCE($3, transaction_hash),
           amount_eth = COALESCE($4, amount_eth),
           asset = COALESCE($5, asset)
       WHERE id = (
         SELECT id
         FROM premium_payments
         WHERE settlement_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       )
       RETURNING *`,
      [
        input.settlementId,
        input.status,
        input.transactionHash ?? null,
        input.amountEth ?? null,
        input.asset ?? null,
      ]
    );

    return result.rows[0] ? mapPremiumPaymentRecord(result.rows[0]) : null;
  }
}
