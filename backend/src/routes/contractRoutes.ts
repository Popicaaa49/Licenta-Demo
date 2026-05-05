import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ContractService } from "../services/contractService";

export const createContractRouter = (service: ContractService) => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const result = await service.listContracts();
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

      const result = await service.getContract(contractId);
      if (!result.dbContract && !result.onChainContract) {
        res.status(404).json({ error: "Contract not found." });
        return;
      }

      res.json(result);
    })
  );

  return router;
};
