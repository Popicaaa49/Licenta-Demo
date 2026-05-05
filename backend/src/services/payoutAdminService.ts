import { PayoutAttemptRepository } from "../repositories/payoutAttemptRepository";
import { PayoutAuditRepository } from "../repositories/payoutAuditRepository";
import { PayoutJobRepository } from "../repositories/payoutJobRepository";
import { PayoutJobStatus } from "../types/payout";

export class PayoutAdminService {
  constructor(
    private readonly payoutJobRepository = new PayoutJobRepository(),
    private readonly payoutAttemptRepository = new PayoutAttemptRepository(),
    private readonly payoutAuditRepository = new PayoutAuditRepository()
  ) {}

  async listJobs(status?: PayoutJobStatus) {
    return this.payoutJobRepository.list(status);
  }

  async getJob(jobId: number) {
    return this.payoutJobRepository.getById(jobId);
  }

  async getAttempts(jobId: number) {
    return this.payoutAttemptRepository.listByJob(jobId);
  }

  async getPolicyAudit(policyId: number) {
    return this.payoutAuditRepository.listByPolicy(policyId);
  }

  async requeue(jobId: number) {
    const currentJob = await this.payoutJobRepository.getById(jobId);
    if (!currentJob) {
      throw new Error(`Payout job ${jobId} was not found.`);
    }

    if (currentJob.status === "confirmed") {
      throw new Error(`Payout job ${jobId} is already confirmed.`);
    }

    if (
      currentJob.status === "queued" ||
      currentJob.status === "processing" ||
      currentJob.status === "submitted"
    ) {
      throw new Error(`Payout job ${jobId} is already pending execution.`);
    }

    const job = await this.payoutJobRepository.requeue(jobId);
    await this.payoutAuditRepository.append(job.policyId, job.id, "job_requeued", {
      jobId,
    });

    return job;
  }
}
