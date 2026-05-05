import { buildGeneratedLocationId, buildLocationIdFromCoordinates } from "../utils/locationId";
import { extractPolygonGeometry } from "../utils/geojson";
import { LocationRepository } from "../repositories/locationRepository";

export type RegisterLocationRequest = {
  locationId?: string;
  locationLabel: string;
  geoJson: unknown;
  sourceType?: string;
  metadata?: Record<string, unknown>;
};

export type EnsurePointLocationRequest = {
  locationId?: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  metadata?: Record<string, unknown>;
};

export class LocationService {
  constructor(private readonly locationRepository = new LocationRepository()) {}

  async registerLocation(input: RegisterLocationRequest) {
    const locationLabel = input.locationLabel.trim();
    if (!locationLabel) {
      throw new Error("locationLabel is required.");
    }

    const geometry = extractPolygonGeometry(input.geoJson);
    const locationId = input.locationId?.trim() || buildGeneratedLocationId(locationLabel);
    const existing = await this.locationRepository.getById(locationId);
    if (existing) {
      throw new Error(`Location ${locationId} already exists.`);
    }

    return this.locationRepository.createFromGeoJson({
      locationId,
      locationLabel,
      sourceType: input.sourceType ?? "geojson_manual",
      geometry,
      metadata: input.metadata,
    });
  }

  async ensurePointLocation(input: EnsurePointLocationRequest) {
    const locationLabel = input.locationLabel.trim();
    if (!locationLabel) {
      throw new Error("locationLabel is required.");
    }

    const locationId =
      input.locationId?.trim() ||
      buildLocationIdFromCoordinates(input.latitude, input.longitude);
    const existing = await this.locationRepository.getById(locationId);
    if (existing) {
      return existing;
    }

    return this.locationRepository.createPointLocation({
      locationId,
      locationLabel,
      latitude: input.latitude,
      longitude: input.longitude,
      sourceType: "point_fallback",
      metadata: input.metadata,
    });
  }

  async getLocation(locationId: string) {
    return this.locationRepository.getById(locationId);
  }

  async listLocations() {
    return this.locationRepository.listAll();
  }
}
