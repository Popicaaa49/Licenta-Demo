import { db } from "../db/pool";
import {
  mapPayoutAuditRecord,
  PayoutAuditEntry,
  PayoutAuditEventType,
  PayoutAuditRecord,
} from "../types/payout";

export class PayoutAuditRepository {
  async append(
    policyId: number,
    payoutJobId: number,
    eventType: PayoutAuditEventType,
    payload: Record<string, unknown>
  ) {
    const result = await db.query<PayoutAuditRecord>(
      `INSERT INTO payout_audit (
          policy_id,
          payout_job_id,
          event_type,
          payload
        )
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING *`,
      [policyId, payoutJobId, eventType, JSON.stringify(payload)]
    );

    return mapPayoutAuditRecord(result.rows[0]);
  }

  async listByPolicy(policyId: number): Promise<PayoutAuditEntry[]> {
    const result = await db.query<PayoutAuditRecord>(
      `SELECT *
       FROM payout_audit
       WHERE policy_id = $1
       ORDER BY created_at DESC, id DESC`,
      [policyId]
    );

    return result.rows.map(mapPayoutAuditRecord);
  }
}
