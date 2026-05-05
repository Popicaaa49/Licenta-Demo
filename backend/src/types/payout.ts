export type PayoutJobStatus =
  | "queued"
  | "processing"
  | "submitted"
  | "confirmed"
  | "retryable_failed"
  | "dead_letter"
  | "cancelled";

export type PayoutAttemptOutcome =
  | "confirmed"
  | "retryable_failed"
  | "fatal_failed";

export type PayoutAuditEventType =
  | "job_created"
  | "job_deduplicated"
  | "processing_started"
  | "tx_submitted"
  | "tx_confirmed"
  | "retry_scheduled"
  | "dead_lettered"
  | "job_requeued";

export type PayoutTriggerReason = "risk_score" | "rain_24h";

export type PayoutErrorKind = "retryable" | "fatal";

export type OracleReportPayload = {
  observedAt: number;
  rain1h: number;
  rain24h: number;
  rain72h: number;
  consecutiveHeavyRainHours: number;
  eventDurationHours: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherCondition: string;
  riskScore: number;
};

export type CreatePayoutJobInput = {
  policyId: number;
  locationId: string;
  triggeringSnapshotId: number;
  idempotencyKey: string;
  reportPayload: OracleReportPayload;
  triggerReason: PayoutTriggerReason;
  priority?: number;
};

export type PayoutJobRecord = {
  id: string;
  policy_id: string;
  location_id: string;
  triggering_snapshot_id: string;
  idempotency_key: string;
  status: PayoutJobStatus;
  priority: number;
  attempt_count: number;
  next_retry_at: Date | null;
  tx_hash: string | null;
  report_payload: OracleReportPayload;
  trigger_reason: PayoutTriggerReason;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PayoutJob = {
  id: number;
  policyId: number;
  locationId: string;
  triggeringSnapshotId: number;
  idempotencyKey: string;
  status: PayoutJobStatus;
  priority: number;
  attemptCount: number;
  nextRetryAt: Date | null;
  txHash: string | null;
  reportPayload: OracleReportPayload;
  triggerReason: PayoutTriggerReason;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PayoutAttemptRecord = {
  id: string;
  payout_job_id: string;
  attempt_number: number;
  started_at: Date;
  finished_at: Date | null;
  outcome: PayoutAttemptOutcome | null;
  tx_hash: string | null;
  error_code: string | null;
  error_message: string | null;
  rpc_url: string | null;
  gas_price: string | null;
  gas_used: string | null;
  created_at: Date;
};

export type PayoutAttempt = {
  id: number;
  payoutJobId: number;
  attemptNumber: number;
  startedAt: Date;
  finishedAt: Date | null;
  outcome: PayoutAttemptOutcome | null;
  txHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rpcUrl: string | null;
  gasPrice: string | null;
  gasUsed: string | null;
  createdAt: Date;
};

export type PayoutAuditRecord = {
  id: string;
  policy_id: string;
  payout_job_id: string;
  event_type: PayoutAuditEventType;
  payload: Record<string, unknown>;
  created_at: Date;
};

export type PayoutAuditEntry = {
  id: number;
  policyId: number;
  payoutJobId: number;
  eventType: PayoutAuditEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type ClassifiedPayoutError = {
  kind: PayoutErrorKind;
  code: string;
  message: string;
};

export const mapPayoutJobRecord = (record: PayoutJobRecord): PayoutJob => ({
  id: Number(record.id),
  policyId: Number(record.policy_id),
  locationId: record.location_id,
  triggeringSnapshotId: Number(record.triggering_snapshot_id),
  idempotencyKey: record.idempotency_key,
  status: record.status,
  priority: record.priority,
  attemptCount: record.attempt_count,
  nextRetryAt: record.next_retry_at,
  txHash: record.tx_hash,
  reportPayload: record.report_payload,
  triggerReason: record.trigger_reason,
  lastErrorCode: record.last_error_code,
  lastErrorMessage: record.last_error_message,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const mapPayoutAttemptRecord = (record: PayoutAttemptRecord): PayoutAttempt => ({
  id: Number(record.id),
  payoutJobId: Number(record.payout_job_id),
  attemptNumber: record.attempt_number,
  startedAt: record.started_at,
  finishedAt: record.finished_at,
  outcome: record.outcome,
  txHash: record.tx_hash,
  errorCode: record.error_code,
  errorMessage: record.error_message,
  rpcUrl: record.rpc_url,
  gasPrice: record.gas_price,
  gasUsed: record.gas_used,
  createdAt: record.created_at,
});

export const mapPayoutAuditRecord = (record: PayoutAuditRecord): PayoutAuditEntry => ({
  id: Number(record.id),
  policyId: Number(record.policy_id),
  payoutJobId: Number(record.payout_job_id),
  eventType: record.event_type,
  payload: record.payload ?? {},
  createdAt: record.created_at,
});
