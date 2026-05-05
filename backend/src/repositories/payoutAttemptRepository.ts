import { db } from "../db/pool";
import {
  mapPayoutAttemptRecord,
  PayoutAttemptOutcome,
  PayoutAttemptRecord,
} from "../types/payout";

export class PayoutAttemptRepository {
  async start(input: {
    payoutJobId: number;
    attemptNumber: number;
    startedAt: Date;
    rpcUrl?: string;
  }) {
    const result = await db.query<PayoutAttemptRecord>(
      `INSERT INTO payout_attempts (
          payout_job_id,
          attempt_number,
          started_at,
          rpc_url
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
      [input.payoutJobId, input.attemptNumber, input.startedAt, input.rpcUrl ?? null]
    );

    return mapPayoutAttemptRecord(result.rows[0]);
  }

  async recordSubmitted(attemptId: number, txHash: string) {
    const result = await db.query<PayoutAttemptRecord>(
      `UPDATE payout_attempts
       SET tx_hash = $2
       WHERE id = $1
       RETURNING *`,
      [attemptId, txHash]
    );

    return result.rows[0] ? mapPayoutAttemptRecord(result.rows[0]) : null;
  }

  async finishConfirmed(
    attemptId: number,
    input: {
      finishedAt: Date;
      gasPrice?: string | null;
      gasUsed?: string | null;
    }
  ) {
    const result = await db.query<PayoutAttemptRecord>(
      `UPDATE payout_attempts
       SET finished_at = $2,
           outcome = 'confirmed',
           gas_price = $3,
           gas_used = $4
       WHERE id = $1
       RETURNING *`,
      [attemptId, input.finishedAt, input.gasPrice ?? null, input.gasUsed ?? null]
    );

    return result.rows[0] ? mapPayoutAttemptRecord(result.rows[0]) : null;
  }

  async finishFailed(
    attemptId: number,
    input: {
      outcome: PayoutAttemptOutcome;
      finishedAt: Date;
      errorCode: string;
      errorMessage: string;
      txHash?: string | null;
    }
  ) {
    const result = await db.query<PayoutAttemptRecord>(
      `UPDATE payout_attempts
       SET finished_at = $2,
           outcome = $3,
           error_code = $4,
           error_message = $5,
           tx_hash = COALESCE($6, tx_hash)
       WHERE id = $1
       RETURNING *`,
      [
        attemptId,
        input.finishedAt,
        input.outcome,
        input.errorCode,
        input.errorMessage,
        input.txHash ?? null,
      ]
    );

    return result.rows[0] ? mapPayoutAttemptRecord(result.rows[0]) : null;
  }

  async listByJob(jobId: number) {
    const result = await db.query<PayoutAttemptRecord>(
      `SELECT *
       FROM payout_attempts
       WHERE payout_job_id = $1
       ORDER BY attempt_number DESC, id DESC`,
      [jobId]
    );

    return result.rows.map(mapPayoutAttemptRecord);
  }

  async finishLatestOpenConfirmed(
    jobId: number,
    input: {
      finishedAt: Date;
      gasPrice?: string | null;
      gasUsed?: string | null;
    }
  ) {
    const result = await db.query<PayoutAttemptRecord>(
      `WITH latest_open AS (
          SELECT id
          FROM payout_attempts
          WHERE payout_job_id = $1
            AND finished_at IS NULL
          ORDER BY attempt_number DESC, id DESC
          LIMIT 1
        )
        UPDATE payout_attempts
        SET finished_at = $2,
            outcome = 'confirmed',
            gas_price = $3,
            gas_used = $4
        WHERE id IN (SELECT id FROM latest_open)
        RETURNING *`,
      [jobId, input.finishedAt, input.gasPrice ?? null, input.gasUsed ?? null]
    );

    return result.rows[0] ? mapPayoutAttemptRecord(result.rows[0]) : null;
  }

  async finishLatestOpenFailed(
    jobId: number,
    input: {
      outcome: PayoutAttemptOutcome;
      finishedAt: Date;
      errorCode: string;
      errorMessage: string;
      txHash?: string | null;
    }
  ) {
    const result = await db.query<PayoutAttemptRecord>(
      `WITH latest_open AS (
          SELECT id
          FROM payout_attempts
          WHERE payout_job_id = $1
            AND finished_at IS NULL
          ORDER BY attempt_number DESC, id DESC
          LIMIT 1
        )
        UPDATE payout_attempts
        SET finished_at = $2,
            outcome = $3,
            error_code = $4,
            error_message = $5,
            tx_hash = COALESCE($6, tx_hash)
        WHERE id IN (SELECT id FROM latest_open)
        RETURNING *`,
      [
        jobId,
        input.finishedAt,
        input.outcome,
        input.errorCode,
        input.errorMessage,
        input.txHash ?? null,
      ]
    );

    return result.rows[0] ? mapPayoutAttemptRecord(result.rows[0]) : null;
  }
}
