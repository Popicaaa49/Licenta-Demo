import express, { NextFunction, Request, Response } from "express";
import { createContractRouter } from "./routes/contractRoutes";
import { createInsuranceRequestRouter } from "./routes/insuranceRequestRoutes";
import { createLocationRouter } from "./routes/locationRoutes";
import { createNotificationRouter } from "./routes/notificationRoutes";
import { createOracleRouter } from "./routes/oracleRoutes";
import { createPayoutRouter } from "./routes/payoutRoutes";
import { createRiskRouter } from "./routes/riskRoutes";
import { ContractService } from "./services/contractService";
import { InsuranceRequestService } from "./services/insuranceRequestService";
import { LocationIntakeService } from "./services/locationIntakeService";
import { LocationService } from "./services/locationService";
import { OracleIngestionService } from "./services/oracleIngestionService";
import { PayoutAdminService } from "./services/payoutAdminService";
import { PayoutOrchestrator } from "./services/payoutOrchestrator";
import { RiskQueryService } from "./services/riskQueryService";
import { RiskStreamBroker } from "./services/riskStreamBroker";

const riskStreamBroker = new RiskStreamBroker();
const payoutOrchestrator = new PayoutOrchestrator();
const oracleService = new OracleIngestionService({
  riskStreamBroker,
  payoutOrchestrator,
});
const locationService = new LocationService();
const locationIntakeService = new LocationIntakeService(locationService);
const contractService = new ContractService({ locationIntakeService });
const insuranceRequestService = new InsuranceRequestService({
  locationIntakeService,
  contractService,
});
const riskQueryService = new RiskQueryService();
const payoutAdminService = new PayoutAdminService();

export const createApp = () => {
  const app = express();

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-oracle-key");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/oracle", createOracleRouter(oracleService));
  app.use("/risk", createRiskRouter(riskQueryService, riskStreamBroker));
  app.use("/location", createLocationRouter(locationService));
  app.use("/insurance-request", createInsuranceRequestRouter(insuranceRequestService));
  app.use("/contract", createContractRouter(contractService));
  app.use("/notifications", createNotificationRouter());
  app.use("/payout", createPayoutRouter(payoutAdminService));

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({
      error: error.message || "Unexpected server error.",
    });
  });

  return app;
};
