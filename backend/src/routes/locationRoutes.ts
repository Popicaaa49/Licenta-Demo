import { Router } from "express";
import { LocationService } from "../services/locationService";
import { asyncHandler } from "../utils/asyncHandler";

export const createLocationRouter = (service: LocationService) => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const locations = await service.listLocations();
      res.json(locations);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const location = await service.registerLocation({
        locationId:
          typeof body.locationId === "string" ? body.locationId.trim() || undefined : undefined,
        locationLabel: String(body.locationLabel ?? "").trim(),
        geoJson: body.geoJson,
        sourceType:
          typeof body.sourceType === "string" ? body.sourceType.trim() || undefined : undefined,
        metadata:
          typeof body.metadata === "object" && body.metadata !== null
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });

      res.status(201).json(location);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const locationId = String(req.params.id || "").trim();
      if (!locationId) {
        res.status(400).json({ error: "Location id is required." });
        return;
      }

      const location = await service.getLocation(locationId);
      if (!location) {
        res.status(404).json({ error: "Location not found." });
        return;
      }

      res.json(location);
    })
  );

  return router;
};
