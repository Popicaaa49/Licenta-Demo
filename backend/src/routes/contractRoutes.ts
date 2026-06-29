import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ContractService } from "../services/contractService";

export const createContractRouter = (service: ContractService) => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const viewerAddress =
        typeof req.query.viewerAddress === "string" ? req.query.viewerAddress : undefined;
      if (!viewerAddress) {
        res.status(400).json({ error: "viewerAddress is required." });
        return;
      }

      const result = await service.listPolicies(viewerAddress);
      res.json(result);
    })
  );

  router.get(
    "/policies",
    asyncHandler(async (req, res) => {
      const viewerAddress =
        typeof req.query.viewerAddress === "string" ? req.query.viewerAddress : undefined;
      const result = await service.listPolicies(viewerAddress);
      res.json(result);
    })
  );

  router.post(
    "/create",
    asyncHandler(async (req, res) => {
      const result = await service.createContract(req.body);
      res.status(201).json(result);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const contractId = Number(req.params.id);
      if (Number.isNaN(contractId)) {
        res.status(400).json({ error: "Contract id must be numeric." });
        return;
      }
      const viewerAddress =
        typeof req.query.viewerAddress === "string" ? req.query.viewerAddress : undefined;

      const access = await service.canViewContract(contractId, viewerAddress);
      if (!access.exists) {
        res.status(404).json({ error: "Contract not found." });
        return;
      }
      if (!access.allowed) {
        res.status(403).json({ error: "You are not allowed to view this contract." });
        return;
      }

      const result = await service.getContract(contractId);
      res.json(result);
    })
  );

  return router;
};
