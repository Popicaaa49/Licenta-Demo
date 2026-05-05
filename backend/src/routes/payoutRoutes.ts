import { Router } from "express";
import { PayoutAdminService } from "../services/payoutAdminService";
import { asyncHandler } from "../utils/asyncHandler";
import { PayoutJobStatus } from "../types/payout";

const isPayoutJobStatus = (value: string): value is PayoutJobStatus =>
  [
    "queued",
    "processing",
    "submitted",
    "confirmed",
    "retryable_failed",
    "dead_letter",
    "cancelled",
  ].includes(value);

export const createPayoutRouter = (service: PayoutAdminService) => {
  const router = Router();

  router.get(
    "/jobs",
    asyncHandler(async (req, res) => {
      const rawStatus = typeof req.query.status === "string" ? req.query.status.trim() : "";
      if (rawStatus && !isPayoutJobStatus(rawStatus)) {
        res.status(400).json({ error: "Invalid payout job status." });
        return;
      }

      const status: PayoutJobStatus | undefined =
        rawStatus && isPayoutJobStatus(rawStatus) ? rawStatus : undefined;
      const jobs = await service.listJobs(status);
      res.json(jobs);
    })
  );

  router.get(
    "/jobs/:id",
    asyncHandler(async (req, res) => {
      const jobId = Number(req.params.id);
      if (Number.isNaN(jobId)) {
        res.status(400).json({ error: "Job id must be numeric." });
        return;
      }

      const job = await service.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: "Payout job not found." });
        return;
      }

      res.json(job);
    })
  );

  router.get(
    "/jobs/:id/attempts",
    asyncHandler(async (req, res) => {
      const jobId = Number(req.params.id);
      if (Number.isNaN(jobId)) {
        res.status(400).json({ error: "Job id must be numeric." });
        return;
      }

      const attempts = await service.getAttempts(jobId);
      res.json(attempts);
    })
  );

  router.post(
    "/jobs/:id/requeue",
    asyncHandler(async (req, res) => {
      const jobId = Number(req.params.id);
      if (Number.isNaN(jobId)) {
        res.status(400).json({ error: "Job id must be numeric." });
        return;
      }

      const existingJob = await service.getJob(jobId);
      if (!existingJob) {
        res.status(404).json({ error: "Payout job not found." });
        return;
      }

      if (existingJob.status === "confirmed") {
        res.status(409).json({ error: "Confirmed payout jobs cannot be requeued." });
        return;
      }

      if (
        existingJob.status === "queued" ||
        existingJob.status === "processing" ||
        existingJob.status === "submitted"
      ) {
        res.status(409).json({ error: "Payout job is already pending execution." });
        return;
      }

      const job = await service.requeue(jobId);
      res.json(job);
    })
  );

  router.get(
    "/policy/:policyId/audit",
    asyncHandler(async (req, res) => {
      const policyId = Number(req.params.policyId);
      if (Number.isNaN(policyId)) {
        res.status(400).json({ error: "Policy id must be numeric." });
        return;
      }

      const auditEntries = await service.getPolicyAudit(policyId);
      res.json(auditEntries);
    })
  );

  return router;
};
