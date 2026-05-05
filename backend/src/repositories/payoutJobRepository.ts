import { PoolClient } from "pg";
import { db } from "../db/pool";
import {
  CreatePayoutJobInput,
  mapPayoutJobRecord,
  PayoutJob,
  PayoutJobRecord,
  PayoutJobStatus,
} from "../types/payout";

const RUNNABLE_STATUSES: PayoutJobStatus[] = ["queued", "retryable_failed"];

export class PayoutJobRepository {
  async createIfAbsent(input: CreatePayoutJobInput) {
    const inserted = await db.query<PayoutJobRecord>(
      `INSERT INTO payout_jobs (
          policy_id,
          location_id,
          triggering_snapshot_id,
          idempotency_key,
          status,
          priority,
          report_payload,
          trigger_reason
        )
        VALUES ($1, $2, $3, $4, 'queued', $5, $6::jsonb, $7)
        ON CONFLICT (policy_id) DO NOTHING
        RETURNING *`,
      [
        input.policyId,
        input.locationId,
        input.triggeringSnapshotId,
        input.idempotencyKey,
        input.priority ?? 0,
        JSON.stringify(input.reportPayload),
        input.triggerReason,
      ]
    );

    if (inserted.rows[0]) {
      return {
        job: mapPayoutJobRecord(inserted.rows[0]),
        deduplicated: false,
      };
    }

    const existing = await this.getByPolicyId(input.policyId);
    if (!existing) {
      throw new Error(`Unable to create or locate payout job for policy ${input.policyId}.`);
    }

    return {
      job: existing,
      deduplicated: true,
    };
  }

  async getById(jobId: number) {
    const result = await db.query<PayoutJobRecord>(
      `SELECT *
       FROM payout_jobs
       WHERE id = $1`,
      [jobId]
    );

    return result.rows[0] ? mapPayoutJobRecord(result.rows[0]) : null;
  }

  async getByPolicyId(policyId: number) {
    const result = await db.query<PayoutJobRecord>(
      `SELECT *
       FROM payout_jobs
       WHERE policy_id = $1`,
      [policyId]
    );

    return result.rows[0] ? mapPayoutJobRecord(result.rows[0]) : null;
  }

  async list(status?: PayoutJobStatus) {
    const result = await db.query<PayoutJobRecord>(
      `SELECT *
       FROM payout_jobs
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC, id DESC`,
      [status ?? null]
    );

    return result.rows.map(mapPayoutJobRecord);
  }

  async claimNextRunnable(now: Date) {
    return db.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query<PayoutJobRecord>(
          `SELECT *
           FROM payout_jobs
           WHERE status = ANY($1::text[])
             AND (next_retry_at IS NULL OR next_retry_at <= $2)
           ORDER BY priority DESC, created_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          [RUNNABLE_STATUSES, now]
        );

        if (!selected.rows[0]) {
          await client.query("COMMIT");
          return null;
        }

        const claimed = await this.updateWithClient(client, selected.rows[0].id, {
          status: "processing",
          bumpAttemptCount: true,
          nextRetryAt: null,
        });

        await client.query("COMMIT");
        return claimed;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async claimStaleProcessing(cutoff: Date) {
    return db.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query<PayoutJobRecord>(
          `SELECT *
           FROM payout_jobs
           WHERE status = 'processing'
             AND updated_at <= $1
           ORDER BY updated_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          [cutoff]
        );

        if (!selected.rows[0]) {
          await client.query("COMMIT");
          return null;
        }

        const touched = await client.query<PayoutJobRecord>(
          `UPDATE payout_jobs
           SET updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [selected.rows[0].id]
        );

        await client.query("COMMIT");
        return touched.rows[0] ? mapPayoutJobRecord(touched.rows[0]) : null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async claimStaleSubmitted(cutoff: Date) {
    return db.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const selected = await client.query<PayoutJobRecord>(
          `SELECT *
           FROM payout_jobs
           WHERE status = 'submitted'
             AND tx_hash IS NOT NULL
             AND updated_at <= $1
           ORDER BY updated_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          [cutoff]
        );

        if (!selected.rows[0]) {
          await client.query("COMMIT");
          return null;
        }

        const touched = await client.query<PayoutJobRecord>(
          `UPDATE payout_jobs
           SET updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [selected.rows[0].id]
        );

        await client.query("COMMIT");
        return touched.rows[0] ? mapPayoutJobRecord(touched.rows[0]) : null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async markSubmitted(jobId: number, txHash: string) {
    return this.update(jobId, {
      status: "submitted",
      txHash,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  }

  async markConfirmed(jobId: number, txHash: string) {
    return this.update(jobId, {
      status: "confirmed",
      txHash,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  }

  async markRetryableFailure(
    jobId: number,
    errorCode: string,
    errorMessage: string,
    nextRetryAt: Date | null
  ) {
    return this.update(jobId, {
      status: nextRetryAt ? "retryable_failed" : "dead_letter",
      nextRetryAt,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    });
  }

  async markDeadLetter(jobId: number, errorCode: string, errorMessage: string) {
    return this.update(jobId, {
      status: "dead_letter",
      nextRetryAt: null,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    });
  }

  async requeue(jobId: number) {
    return this.update(jobId, {
      status: "queued",
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  }

  async touch(jobId: number) {
    return db.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await client.query<PayoutJobRecord>(
          `UPDATE payout_jobs
           SET updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [jobId]
        );
        await client.query("COMMIT");

        if (!result.rows[0]) {
          throw new Error(`Payout job ${jobId} was not found.`);
        }

        return mapPayoutJobRecord(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async update(
    jobId: number,
    input: {
      status?: PayoutJobStatus;
      txHash?: string | null;
      nextRetryAt?: Date | null;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
      bumpAttemptCount?: boolean;
    }
  ) {
    return db.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const updated = await this.updateWithClient(client, jobId, input);
        await client.query("COMMIT");
        return updated;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async updateWithClient(
    client: PoolClient,
    jobId: string | number,
    input: {
      status?: PayoutJobStatus;
      txHash?: string | null;
      nextRetryAt?: Date | null;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
      bumpAttemptCount?: boolean;
    }
  ) {
    const result = await client.query<PayoutJobRecord>(
      `UPDATE payout_jobs
       SET status = COALESCE($2::text, status),
           tx_hash = COALESCE($3::text, tx_hash),
           next_retry_at = $4::timestamptz,
           last_error_code = $5::text,
           last_error_message = $6::text,
           attempt_count = attempt_count + CASE WHEN $7::boolean THEN 1 ELSE 0 END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        jobId,
        input.status ?? null,
        input.txHash ?? null,
        input.nextRetryAt ?? null,
        input.lastErrorCode ?? null,
        input.lastErrorMessage ?? null,
        input.bumpAttemptCount ?? false,
      ]
    );

    if (!result.rows[0]) {
      throw new Error(`Payout job ${jobId} was not found.`);
    }

    return mapPayoutJobRecord(result.rows[0]);
  }
}
