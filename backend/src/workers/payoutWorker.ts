import { ContractRepository } from "../repositories/contractRepository";
import { NotificationRepository } from "../repositories/notificationRepository";
import { PayoutAttemptRepository } from "../repositories/payoutAttemptRepository";
import { PayoutAuditRepository } from "../repositories/payoutAuditRepository";
import { PayoutJobRepository } from "../repositories/payoutJobRepository";
import { env } from "../config/env";
import { ErrorClassifier } from "../utils/errorClassifier";
import { RetryPolicy } from "../utils/retryPolicy";
import { PayoutExecutor } from "../services/payoutExecutor";
import { InsuranceContractClient } from "../blockchain/insuranceContractClient";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PayoutWorker {
  constructor(
    private readonly payoutJobRepository = new PayoutJobRepository(),
    private readonly payoutAttemptRepository = new PayoutAttemptRepository(),
    private readonly payoutAuditRepository = new PayoutAuditRepository(),
    private readonly payoutExecutor = new PayoutExecutor(),
    private readonly errorClassifier = new ErrorClassifier(),
    private readonly retryPolicy = new RetryPolicy(),
    private readonly contractRepository = new ContractRepository(),
    private readonly insuranceClient = new InsuranceContractClient(),
    private readonly notificationRepository = new NotificationRepository()
  ) {}

  async runOnce(now = new Date()) {
    const recoveredSubmitted = await this.reconcileStaleSubmittedJob(now);
    if (recoveredSubmitted) {
      return true;
    }

    const recoveredProcessing = await this.recoverStaleProcessingJob(now);
    if (recoveredProcessing) {
      return true;
    }

    const job = await this.payoutJobRepository.claimNextRunnable(now);
    if (!job) {
      return false;
    }

    await this.processJob(job.id);
    return true;
  }

  async runForever(pollIntervalMs = env.payoutWorkerPollIntervalMs) {
    for (;;) {
      try {
        const processed = await this.runOnce(new Date());
        if (!processed) {
          await sleep(pollIntervalMs);
        }
      } catch (error) {
        console.error("[payout-worker] cycle failed", error);
        await sleep(pollIntervalMs);
      }
    }
  }

  private async processJob(jobId: number) {
    const job = await this.payoutJobRepository.getById(jobId);
    if (!job) {
      throw new Error(`Payout job ${jobId} no longer exists.`);
    }

    const attempt = await this.payoutAttemptRepository.start({
      payoutJobId: job.id,
      attemptNumber: job.attemptCount,
      startedAt: new Date(),
      rpcUrl: env.rpcUrl,
    });

    await this.payoutAuditRepository.append(job.policyId, job.id, "processing_started", {
      attemptNumber: job.attemptCount,
      triggeringSnapshotId: job.triggeringSnapshotId,
    });

    let txHash: string | null = null;

    try {
      const submission = await this.payoutExecutor.submit(job.policyId, job.reportPayload);
      const submittedTxHash = submission.txHash;
      txHash = submittedTxHash;

      await this.payoutJobRepository.markSubmitted(job.id, submittedTxHash);
      await this.payoutAttemptRepository.recordSubmitted(attempt.id, submittedTxHash);
      await this.payoutAuditRepository.append(job.policyId, job.id, "tx_submitted", {
        txHash: submittedTxHash,
      });

      const confirmation = await this.payoutExecutor.confirm(submittedTxHash);
      if (!confirmation.success) {
        throw new Error(`Transaction ${submittedTxHash} was mined with status 0.`);
      }

      const onChainPolicy = await this.insuranceClient.getPolicy(job.policyId);
      await this.contractRepository.updateStatus(job.policyId, {
        active: onChainPolicy.active,
        payoutTriggered: onChainPolicy.payoutTriggered,
        lastRiskScore: job.reportPayload.riskScore,
        payoutTxHash: submittedTxHash,
      });

      await this.payoutAttemptRepository.finishConfirmed(attempt.id, {
        finishedAt: new Date(),
        gasPrice: confirmation.gasPrice,
        gasUsed: confirmation.gasUsed,
      });
      await this.payoutJobRepository.markConfirmed(job.id, submittedTxHash);
      await this.payoutAuditRepository.append(job.policyId, job.id, "tx_confirmed", {
        txHash: submittedTxHash,
        gasPrice: confirmation.gasPrice,
        gasUsed: confirmation.gasUsed,
        payoutTriggered: onChainPolicy.payoutTriggered,
        active: onChainPolicy.active,
      });
      await this.notifyPolicyParticipants(job.policyId, {
        type: "payout_paid",
        title: "Payout platit",
        message: `Payout-ul pentru polita #${job.policyId} a fost confirmat on-chain.`,
        entityType: "policy",
        entityId: job.policyId,
        dedupeKey: `payout_paid:${job.id}`,
        metadata: {
          payoutJobId: job.id,
          txHash: submittedTxHash,
          gasPrice: confirmation.gasPrice,
          gasUsed: confirmation.gasUsed,
        },
      });
    } catch (error) {
      const classified = this.errorClassifier.classify(error);
      const nextRetryAt =
        classified.kind === "retryable"
          ? this.retryPolicy.getNextRetryAt(job.attemptCount, new Date())
          : null;

      await this.payoutAttemptRepository.finishFailed(attempt.id, {
        outcome: nextRetryAt ? "retryable_failed" : "fatal_failed",
        finishedAt: new Date(),
        errorCode: classified.code,
        errorMessage: classified.message,
        txHash,
      });

      if (nextRetryAt) {
        await this.payoutJobRepository.markRetryableFailure(
          job.id,
          classified.code,
          classified.message,
          nextRetryAt
        );
        await this.payoutAuditRepository.append(job.policyId, job.id, "retry_scheduled", {
          errorCode: classified.code,
          errorMessage: classified.message,
          nextRetryAt: nextRetryAt.toISOString(),
          txHash,
        });
        await this.notifyPolicyParticipants(job.policyId, {
          type: "payout_retry_scheduled",
          title: "Payout reprogramat",
          message: `Executia payout-ului pentru polita #${job.policyId} a esuat temporar si va fi reincercata.`,
          entityType: "policy",
          entityId: job.policyId,
          dedupeKey: `payout_retry_scheduled:${job.id}:${job.attemptCount}`,
          metadata: {
            payoutJobId: job.id,
            errorCode: classified.code,
            errorMessage: classified.message,
            nextRetryAt: nextRetryAt.toISOString(),
            txHash,
          },
        });
        return;
      }

      await this.payoutJobRepository.markDeadLetter(
        job.id,
        classified.code,
        classified.message
      );
      await this.payoutAuditRepository.append(job.policyId, job.id, "dead_lettered", {
        errorCode: classified.code,
        errorMessage: classified.message,
        txHash,
      });
      await this.notifyPolicyParticipants(job.policyId, {
        type: "payout_failed",
        title: "Payout esuat",
        message: `Executia payout-ului pentru polita #${job.policyId} a esuat definitiv si necesita verificare manuala.`,
        entityType: "policy",
        entityId: job.policyId,
        dedupeKey: `payout_failed:${job.id}`,
        metadata: {
          payoutJobId: job.id,
          errorCode: classified.code,
          errorMessage: classified.message,
          txHash,
        },
      });
    }
  }

  private async notifyPolicyParticipants(
    policyId: number,
    notification: {
      type: string;
      title: string;
      message: string;
      entityType: string;
      entityId?: number | null;
      dedupeKey?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) {
    try {
      const policy = await this.contractRepository.getById(policyId);
      if (!policy) {
        return;
      }

      const recipients = [policy.user_address, policy.underwriter_address].filter(
        (recipient): recipient is string => Boolean(recipient)
      );

      await this.notificationRepository.createMany(
        recipients.map((recipientAddress) => ({
          recipientAddress,
          ...notification,
        }))
      );
    } catch (error) {
      console.warn("Unable to create payout notification", error);
    }
  }

  private async recoverStaleProcessingJob(now: Date) {
    const staleJob = await this.payoutJobRepository.claimStaleProcessing(
      new Date(now.getTime() - env.payoutStaleJobTimeoutMs)
    );
    if (!staleJob) {
      return false;
    }

    const nextRetryAt = this.retryPolicy.getNextRetryAt(staleJob.attemptCount, now);

    await this.payoutAttemptRepository.finishLatestOpenFailed(staleJob.id, {
      outcome: nextRetryAt ? "retryable_failed" : "fatal_failed",
      finishedAt: now,
      errorCode: "STALE_PROCESSING_RECOVERED",
      errorMessage:
        "Recovered stale processing job after worker crash or lost connectivity.",
    });

    if (nextRetryAt) {
      await this.payoutJobRepository.markRetryableFailure(
        staleJob.id,
        "STALE_PROCESSING_RECOVERED",
        "Recovered stale processing job after worker crash or lost connectivity.",
        nextRetryAt
      );
      await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "retry_scheduled", {
        reason: "stale_processing_recovered",
        nextRetryAt: nextRetryAt.toISOString(),
      });
      await this.notifyPolicyParticipants(staleJob.policyId, {
        type: "payout_retry_scheduled",
        title: "Payout reprogramat",
        message: `Un payout blocat in procesare pentru polita #${staleJob.policyId} a fost recuperat si reprogramat.`,
        entityType: "policy",
        entityId: staleJob.policyId,
        dedupeKey: `payout_retry_scheduled:${staleJob.id}:stale_processing`,
        metadata: {
          payoutJobId: staleJob.id,
          reason: "stale_processing_recovered",
          nextRetryAt: nextRetryAt.toISOString(),
        },
      });
      return true;
    }

    await this.payoutJobRepository.markDeadLetter(
      staleJob.id,
      "STALE_PROCESSING_RECOVERED",
      "Recovered stale processing job but retry budget was exhausted."
    );
    await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "dead_lettered", {
      reason: "stale_processing_recovered",
    });
    await this.notifyPolicyParticipants(staleJob.policyId, {
      type: "payout_failed",
      title: "Payout esuat",
      message: `Payout-ul pentru polita #${staleJob.policyId} a ramas blocat si nu mai poate fi reincercat automat.`,
      entityType: "policy",
      entityId: staleJob.policyId,
      dedupeKey: `payout_failed:${staleJob.id}`,
      metadata: {
        payoutJobId: staleJob.id,
        reason: "stale_processing_recovered",
      },
    });

    return true;
  }

  private async reconcileStaleSubmittedJob(now: Date) {
    const staleJob = await this.payoutJobRepository.claimStaleSubmitted(
      new Date(now.getTime() - env.payoutStaleJobTimeoutMs)
    );
    if (!staleJob || !staleJob.txHash) {
      return false;
    }

    const txState = await this.insuranceClient.inspectTransaction(staleJob.txHash);

    if (txState.state === "pending") {
      await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "tx_submitted", {
        txHash: staleJob.txHash,
        reconciliation: "pending",
      });
      return true;
    }

    if (txState.state === "confirmed_success") {
      const onChainPolicy = await this.insuranceClient.getPolicy(staleJob.policyId);
      await this.contractRepository.updateStatus(staleJob.policyId, {
        active: onChainPolicy.active,
        payoutTriggered: onChainPolicy.payoutTriggered,
        lastRiskScore: staleJob.reportPayload.riskScore,
        payoutTxHash: staleJob.txHash,
      });
      await this.payoutAttemptRepository.finishLatestOpenConfirmed(staleJob.id, {
        finishedAt: now,
        gasPrice: txState.gasPrice,
        gasUsed: txState.gasUsed,
      });
      await this.payoutJobRepository.markConfirmed(staleJob.id, staleJob.txHash);
      await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "tx_confirmed", {
        txHash: staleJob.txHash,
        gasPrice: txState.gasPrice,
        gasUsed: txState.gasUsed,
        reconciliation: "stale_submitted_recovered",
      });
      await this.notifyPolicyParticipants(staleJob.policyId, {
        type: "payout_paid",
        title: "Payout platit",
        message: `Payout-ul pentru polita #${staleJob.policyId} a fost confirmat on-chain dupa reconciliere.`,
        entityType: "policy",
        entityId: staleJob.policyId,
        dedupeKey: `payout_paid:${staleJob.id}`,
        metadata: {
          payoutJobId: staleJob.id,
          txHash: staleJob.txHash,
          gasPrice: txState.gasPrice,
          gasUsed: txState.gasUsed,
          reconciliation: "stale_submitted_recovered",
        },
      });
      return true;
    }

    if (txState.state === "confirmed_failed") {
      await this.payoutAttemptRepository.finishLatestOpenFailed(staleJob.id, {
        outcome: "fatal_failed",
        finishedAt: now,
        errorCode: "SUBMITTED_TX_REVERTED",
        errorMessage: `Submitted transaction ${staleJob.txHash} was mined with failure status.`,
        txHash: staleJob.txHash,
      });
      await this.payoutJobRepository.markDeadLetter(
        staleJob.id,
        "SUBMITTED_TX_REVERTED",
        `Submitted transaction ${staleJob.txHash} was mined with failure status.`
      );
      await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "dead_lettered", {
        txHash: staleJob.txHash,
        reason: "submitted_tx_reverted",
      });
      await this.notifyPolicyParticipants(staleJob.policyId, {
        type: "payout_failed",
        title: "Payout esuat",
        message: `Tranzactia de payout pentru polita #${staleJob.policyId} a fost minata cu status de esec.`,
        entityType: "policy",
        entityId: staleJob.policyId,
        dedupeKey: `payout_failed:${staleJob.id}`,
        metadata: {
          payoutJobId: staleJob.id,
          txHash: staleJob.txHash,
          reason: "submitted_tx_reverted",
        },
      });
      return true;
    }

    const nextRetryAt = this.retryPolicy.getNextRetryAt(staleJob.attemptCount, now);
    await this.payoutAttemptRepository.finishLatestOpenFailed(staleJob.id, {
      outcome: nextRetryAt ? "retryable_failed" : "fatal_failed",
      finishedAt: now,
      errorCode: "SUBMITTED_TX_MISSING",
      errorMessage: `Submitted transaction ${staleJob.txHash} could not be found on-chain.`,
      txHash: staleJob.txHash,
    });

    if (nextRetryAt) {
      await this.payoutJobRepository.markRetryableFailure(
        staleJob.id,
        "SUBMITTED_TX_MISSING",
        `Submitted transaction ${staleJob.txHash} could not be found on-chain.`,
        nextRetryAt
      );
      await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "retry_scheduled", {
        txHash: staleJob.txHash,
        reason: "submitted_tx_missing",
        nextRetryAt: nextRetryAt.toISOString(),
      });
      await this.notifyPolicyParticipants(staleJob.policyId, {
        type: "payout_retry_scheduled",
        title: "Payout reprogramat",
        message: `Tranzactia payout pentru polita #${staleJob.policyId} nu a fost gasita on-chain si va fi retrimisa.`,
        entityType: "policy",
        entityId: staleJob.policyId,
        dedupeKey: `payout_retry_scheduled:${staleJob.id}:submitted_missing`,
        metadata: {
          payoutJobId: staleJob.id,
          txHash: staleJob.txHash,
          reason: "submitted_tx_missing",
          nextRetryAt: nextRetryAt.toISOString(),
        },
      });
      return true;
    }

    await this.payoutJobRepository.markDeadLetter(
      staleJob.id,
      "SUBMITTED_TX_MISSING",
      `Submitted transaction ${staleJob.txHash} could not be found on-chain.`
    );
    await this.payoutAuditRepository.append(staleJob.policyId, staleJob.id, "dead_lettered", {
      txHash: staleJob.txHash,
      reason: "submitted_tx_missing",
    });
    await this.notifyPolicyParticipants(staleJob.policyId, {
      type: "payout_failed",
      title: "Payout esuat",
      message: `Tranzactia payout pentru polita #${staleJob.policyId} nu a fost gasita si bugetul de retry a fost epuizat.`,
      entityType: "policy",
      entityId: staleJob.policyId,
      dedupeKey: `payout_failed:${staleJob.id}`,
      metadata: {
        payoutJobId: staleJob.id,
        txHash: staleJob.txHash,
        reason: "submitted_tx_missing",
      },
    });

    return true;
  }
}

const main = async () => {
  const worker = new PayoutWorker();
  await worker.runForever();
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
