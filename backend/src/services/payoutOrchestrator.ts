import { ContractRecord, ContractRepository } from "../repositories/contractRepository";
import { NotificationRepository } from "../repositories/notificationRepository";
import { PayoutAuditRepository } from "../repositories/payoutAuditRepository";
import { PayoutJobRepository } from "../repositories/payoutJobRepository";
import { RiskSnapshot } from "../types/riskSnapshot";
import { IdempotencyKeyFactory } from "../utils/idempotencyKeyFactory";
import { PayoutDecisionService } from "./payoutDecisionService";

export class PayoutOrchestrator {
  constructor(
    private readonly decisionService = new PayoutDecisionService(),
    private readonly jobRepository = new PayoutJobRepository(),
    private readonly auditRepository = new PayoutAuditRepository(),
    private readonly idempotencyKeyFactory = new IdempotencyKeyFactory(),
    private readonly contractRepository = new ContractRepository(),
    private readonly notificationRepository = new NotificationRepository()
  ) {}

  async enqueueTriggeredPolicies(input: {
    locationId: string;
    snapshot: RiskSnapshot;
    activePolicies: ContractRecord[];
  }) {
    const jobs: Array<{
      jobId: number;
      policyId: number;
      deduplicated: boolean;
      status: string;
    }> = [];

    for (const policy of input.activePolicies) {
      const policyId = Number(policy.id);
      await this.contractRepository.updateMonitoringState(policyId, input.snapshot.riskScore);

      const decision = this.decisionService.decide(policy, input.snapshot);
      if (!decision.shouldEnqueue || !decision.reportPayload || !decision.triggerReason) {
        continue;
      }

      const idempotencyKey = this.idempotencyKeyFactory.buildForSnapshot(
        policyId,
        input.snapshot.id
      );
      const created = await this.jobRepository.createIfAbsent({
        policyId,
        locationId: input.locationId,
        triggeringSnapshotId: input.snapshot.id,
        idempotencyKey,
        reportPayload: decision.reportPayload,
        triggerReason: decision.triggerReason,
      });

      await this.auditRepository.append(
        policyId,
        created.job.id,
        created.deduplicated ? "job_deduplicated" : "job_created",
        {
          locationId: input.locationId,
          snapshotId: input.snapshot.id,
          riskScore: input.snapshot.riskScore,
          rain24h: input.snapshot.rain24h,
          triggerReason: decision.triggerReason,
          idempotencyKey,
        }
      );

      if (!created.deduplicated) {
        await this.notifyPayoutTriggered(policy, created.job.id, input.snapshot.id, decision.triggerReason);
      }

      jobs.push({
        jobId: created.job.id,
        policyId,
        deduplicated: created.deduplicated,
        status: created.job.status,
      });
    }

    return jobs;
  }

  private async notifyPayoutTriggered(
    policy: ContractRecord,
    payoutJobId: number,
    snapshotId: number,
    triggerReason: string
  ) {
    const recipients = [policy.user_address, policy.underwriter_address].filter(
      (recipient): recipient is string => Boolean(recipient)
    );

    try {
      await this.notificationRepository.createMany(
        recipients.map((recipientAddress) => ({
          recipientAddress,
          type: "payout_triggered",
          title: "Payout declansat",
          message: `Polita #${policy.id} a depasit conditiile parametrice. Payout-ul a fost introdus in coada de executie.`,
          entityType: "policy",
          entityId: Number(policy.id),
          dedupeKey: `payout_triggered:${payoutJobId}`,
          metadata: {
            payoutJobId,
            snapshotId,
            triggerReason,
            locationId: policy.location_id,
            cropType: policy.crop_type,
          },
        }))
      );
    } catch (error) {
      console.warn("Unable to create payout trigger notification", error);
    }
  }
}
