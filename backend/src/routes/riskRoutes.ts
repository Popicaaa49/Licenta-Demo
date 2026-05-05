import { Router } from "express";
import { RiskQueryService } from "../services/riskQueryService";
import { RiskStreamBroker } from "../services/riskStreamBroker";
import { asyncHandler } from "../utils/asyncHandler";
import { RiskSnapshot, toRiskSnapshotDto } from "../types/riskSnapshot";

const parseLocationIds = (value: unknown) => {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
};

const parseHistoryLimit = (value: unknown) => {
  const parsed = Number(value ?? 24);
  if (!Number.isFinite(parsed)) {
    return 24;
  }

  return Math.max(1, Math.min(168, Math.floor(parsed)));
};

const writeSnapshotEvent = (
  res: NodeJS.WritableStream,
  snapshot: RiskSnapshot,
  eventName: string
) => {
  res.write(`id: ${snapshot.id}\n`);
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(toRiskSnapshotDto(snapshot))}\n\n`);
};

export const createRiskRouter = (
  service: RiskQueryService,
  riskStreamBroker: RiskStreamBroker
) => {
  const router = Router();

  router.get(
    "/stream",
    (req, res) => {
      const locationIds = parseLocationIds(req.query.locations);
      if (locationIds.length === 0) {
        res.status(400).json({ error: "locations query param is required." });
        return;
      }

      let lastDeliveredId = Number(req.header("Last-Event-ID") ?? 0);
      if (!Number.isFinite(lastDeliveredId) || lastDeliveredId < 0) {
        lastDeliveredId = 0;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write("retry: 3000\n\n");

      const sendSnapshot = (snapshot: RiskSnapshot, eventName = "risk_snapshot") => {
        if (snapshot.id <= lastDeliveredId) {
          return;
        }

        lastDeliveredId = snapshot.id;
        writeSnapshotEvent(res, snapshot, eventName);
      };

      const unsubscribe = riskStreamBroker.subscribe(locationIds, (snapshot) => {
        try {
          sendSnapshot(snapshot);
        } catch (error) {
          console.error("[risk-stream] failed to write snapshot", error);
        }
      });

      const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 20_000);

      service
        .listSnapshotsAfter(locationIds, lastDeliveredId)
        .then((backlog) => {
          backlog.forEach((snapshot) => sendSnapshot(snapshot, "risk_snapshot_replay"));
        })
        .catch((error) => {
          console.error("[risk-stream] failed to replay backlog", error);
          res.write(
            `event: stream_error\ndata: ${JSON.stringify({
              message: "Unable to replay backlog.",
            })}\n\n`
          );
        });

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        res.end();
      });
    }
  );

  router.get(
    "/history/:location",
    asyncHandler(async (req, res) => {
      const locationId = String(req.params.location || "").trim();
      if (!locationId) {
        res.status(400).json({ error: "location is required." });
        return;
      }

      const history = await service.listHistory(locationId, parseHistoryLimit(req.query.limit));
      res.json(history);
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const locationIds = parseLocationIds(req.query.locations);
      if (locationIds.length === 0) {
        res.status(400).json({ error: "locations query param is required." });
        return;
      }

      const snapshots = await service.listLatestSnapshots(locationIds);
      res.json(snapshots);
    })
  );

  router.get(
    "/:location",
    asyncHandler(async (req, res) => {
      const locationId = String(req.params.location || "").trim();
      if (!locationId) {
        res.status(400).json({ error: "location is required." });
        return;
      }

      const summary = await service.getLocationSummary(locationId);
      if (!summary) {
        res.status(404).json({ error: "No weather data found for location." });
        return;
      }

      res.json(summary);
    })
  );

  return router;
};
