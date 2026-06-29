import { db } from "../db/pool";
import {
  QuoteSettlementRecord,
  mapQuoteSettlementRecord,
} from "../types/underwriting";

export type CreateQuoteSettlementInput = {
  quoteId: number;
  status: string;
  premiumLockWei: string;
  payoutCapWei: string;
  ethEurRate: number;
  rateSource: string;
  rateFetchedAt: Date;
  expiresAt: Date;
};

export class QuoteSettlementRepository {
  async create(input: CreateQuoteSettlementInput) {
    const result = await db.query<QuoteSettlementRecord>(
      `INSERT INTO quote_settlements (
          quote_id,
          status,
          premium_lock_wei,
          payout_cap_wei,
          eth_eur_rate,
          rate_source,
          rate_fetched_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
      [
        input.quoteId,
        input.status,
        input.premiumLockWei,
        input.payoutCapWei,
        input.ethEurRate,
        input.rateSource,
        input.rateFetchedAt,
        input.expiresAt,
      ]
    );

    return mapQuoteSettlementRecord(result.rows[0]);
  }

  async updateTermsRegistration(id: number, termsTxHash: string) {
    const result = await db.query<QuoteSettlementRecord>(
      `UPDATE quote_settlements
       SET terms_tx_hash = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, termsTxHash]
    );

    return result.rows[0] ? mapQuoteSettlementRecord(result.rows[0]) : null;
  }

  async updateStatus(input: {
    id: number;
    status: string;
    underwriterAddress?: string | null;
  }) {
    const result = await db.query<QuoteSettlementRecord>(
      `UPDATE quote_settlements
       SET status = $2,
           underwriter_address = COALESCE($3, underwriter_address),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [input.id, input.status, input.underwriterAddress ?? null]
    );

    return result.rows[0] ? mapQuoteSettlementRecord(result.rows[0]) : null;
  }

  async getLatestByQuoteId(quoteId: number) {
    const result = await db.query<QuoteSettlementRecord>(
      `SELECT *
       FROM quote_settlements
       WHERE quote_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [quoteId]
    );

    return result.rows[0] ? mapQuoteSettlementRecord(result.rows[0]) : null;
  }
}
