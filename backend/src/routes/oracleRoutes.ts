import { Router } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../utils/asyncHandler";
import { OracleIngestionService, OracleUpdatePayload } from "../services/oracleIngestionService";

const toNumber = (value: unknown, fieldName: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${fieldName} must be a number.`);
  }
  return parsed;
};

const parseBody = (body: Record<string, unknown>): OracleUpdatePayload => ({
  locationId: String(body.locationId ?? "").trim(),
  timestamp: String(body.timestamp ?? "").trim(),
  rain1h: toNumber(body.rain1h ?? 0, "rain1h"),
  rain24h:
    body.rain24h === undefined || body.rain24h === null
      ? undefined
      : toNumber(body.rain24h, "rain24h"),
  windSpeed: toNumber(body.windSpeed ?? 0, "windSpeed"),
  temperature: toNumber(body.temperature ?? 0, "temperature"),
  humidity: toNumber(body.humidity ?? 0, "humidity"),
  weatherType: String(body.weatherType ?? "").trim(),
  source: body.source ? String(body.source) : undefined,
  rawPayload: body.rawPayload ?? body,
});

export const createOracleRouter = (service: OracleIngestionService) => {
  const router = Router();

  router.post(
    "/update-weather",
    asyncHandler(async (req, res) => {
      if (env.oracleSharedSecret) {
        const providedSecret = String(req.header("x-oracle-key") ?? "");
        if (providedSecret !== env.oracleSharedSecret) {
          res.status(401).json({ error: "Invalid oracle credentials." });
          return;
        }
      }

      const payload = parseBody(req.body as Record<string, unknown>);
      if (!payload.locationId || !payload.timestamp || !payload.weatherType) {
        res.status(400).json({
          error: "locationId, timestamp and weatherType are required.",
        });
        return;
      }

      const result = await service.processUpdate(payload);
      res.status(201).json(result);
    })
  );

  return router;
};
