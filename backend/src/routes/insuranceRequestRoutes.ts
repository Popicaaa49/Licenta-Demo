import { Router } from "express";
import { InsuranceRequestService } from "../services/insuranceRequestService";
import { asyncHandler } from "../utils/asyncHandler";

export const createInsuranceRequestRouter = (service: InsuranceRequestService) => {
  const router = Router();

  router.get(
    "/catalog",
    asyncHandler(async (_req, res) => {
      const crops = await service.listCropCatalog();
      res.json(crops);
    })
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const requests = await service.listRequests();
      res.json(requests);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const result = await service.createRequest(req.body);
      res.status(201).json(result);
    })
  );

  router.post(
    "/:id/lock-capital",
    asyncHandler(async (req, res) => {
      const requestId = Number(req.params.id);
      if (Number.isNaN(requestId)) {
        res.status(400).json({ error: "Request id must be numeric." });
        return;
      }

      const result = await service.lockLatestQuoteCapital({
        requestId,
        underwriterAddress: String(req.body?.underwriterAddress ?? ""),
        lockedAmountEth: String(req.body?.lockedAmountEth ?? ""),
        transactionHash:
          typeof req.body?.transactionHash === "string" ? req.body.transactionHash : undefined,
      });
      res.json(result);
    })
  );

  router.post(
    "/:id/release-capital",
    asyncHandler(async (req, res) => {
      const requestId = Number(req.params.id);
      if (Number.isNaN(requestId)) {
        res.status(400).json({ error: "Request id must be numeric." });
        return;
      }

      const result = await service.releaseLockedQuoteCapital({
        requestId,
        underwriterAddress: String(req.body?.underwriterAddress ?? ""),
      });
      res.json(result);
    })
  );

  router.post(
    "/:id/lock-premium",
    asyncHandler(async (req, res) => {
      const requestId = Number(req.params.id);
      if (Number.isNaN(requestId)) {
        res.status(400).json({ error: "Request id must be numeric." });
        return;
      }

      const result = await service.lockPremiumPayment({
        requestId,
        payerAddress: String(req.body?.payerAddress ?? ""),
        transactionHash:
          typeof req.body?.transactionHash === "string" ? req.body.transactionHash : undefined,
        asset: typeof req.body?.asset === "string" ? req.body.asset : undefined,
      });
      res.status(201).json(result);
    })
  );

  router.post(
    "/:id/release-premium",
    asyncHandler(async (req, res) => {
      const requestId = Number(req.params.id);
      if (Number.isNaN(requestId)) {
        res.status(400).json({ error: "Request id must be numeric." });
        return;
      }

      const result = await service.releaseLockedPremium({
        requestId,
        payerAddress: String(req.body?.payerAddress ?? ""),
        transactionHash:
          typeof req.body?.transactionHash === "string" ? req.body.transactionHash : undefined,
      });
      res.json(result);
    })
  );

  router.post(
    "/:id/activate",
    asyncHandler(async (req, res) => {
      const requestId = Number(req.params.id);
      if (Number.isNaN(requestId)) {
        res.status(400).json({ error: "Request id must be numeric." });
        return;
      }

      const result = await service.activatePolicyFromQuote({
        requestId,
        thresholdScore:
          req.body?.thresholdScore === undefined ? undefined : Number(req.body.thresholdScore),
        emergencyRain24h:
          req.body?.emergencyRain24h === undefined
            ? undefined
            : Number(req.body.emergencyRain24h),
      });
      res.status(201).json(result);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const requestId = Number(req.params.id);
      if (Number.isNaN(requestId)) {
        res.status(400).json({ error: "Request id must be numeric." });
        return;
      }

      const request = await service.getRequest(requestId);
      if (!request) {
        res.status(404).json({ error: "Insurance request not found." });
        return;
      }

      res.json(request);
    })
  );

  return router;
};
