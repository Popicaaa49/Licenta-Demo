import { ContractRepository } from "../repositories/contractRepository";
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
    private readonly insuranceClient = new InsuranceContractClient()
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
