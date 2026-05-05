import { InsuredLocation } from "../types/location";
import { LocationService } from "./locationService";

export type ResolveLocationInput = {
  userAddress?: string;
  locationId?: string;
  locationLabel?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  locationGeoJson?: unknown;
};

const parseCoordinate = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
};

export class LocationIntakeService {
  constructor(private readonly locationService = new LocationService()) {}

  private parseCoordinates(input: ResolveLocationInput) {
    const latitude = parseCoordinate(input.latitude);
    const longitude = parseCoordinate(input.longitude);

    if (latitude === null && longitude === null) {
      return null;
    }

    if (latitude === null || longitude === null) {
      throw new Error("latitude and longitude must be provided together.");
    }

    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("latitude must be between -90 and 90.");
    }

    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("longitude must be between -180 and 180.");
    }

    return { latitude, longitude };
  }

  private normalizeGeoJson(input: unknown) {
    if (input === null || input === undefined) {
      return null;
    }

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) {
        return null;
      }

      try {
        return JSON.parse(trimmed);
      } catch {
        throw new Error("locationGeoJson must be valid JSON.");
      }
    }

    return input;
  }

  async resolveLocation(input: ResolveLocationInput, createdVia: string): Promise<InsuredLocation> {
    const locationId = input.locationId?.trim() || undefined;
    const locationLabel = input.locationLabel?.trim() || "";
    const coordinates = this.parseCoordinates(input);
    const geoJson = this.normalizeGeoJson(input.locationGeoJson);
    const hasCoordinates = coordinates !== null;
    const hasGeoJson = geoJson !== null;

    if (locationId) {
      const existingLocation = await this.locationService.getLocation(locationId);
      if (existingLocation) {
        if (hasCoordinates || hasGeoJson) {
          throw new Error(
            `Location ${locationId} already exists. Reuse it as-is or choose another locationId.`
          );
        }

        return existingLocation;
      }
    }

    if (hasGeoJson) {
      if (!locationLabel) {
        throw new Error("locationLabel is required when creating a GeoJSON location.");
      }

      return this.locationService.registerLocation({
        locationId,
        locationLabel,
        geoJson,
        sourceType: createdVia,
        metadata: {
          createdVia,
          userAddress: input.userAddress ?? null,
        },
      });
    }

    if (hasCoordinates) {
      if (!locationLabel) {
        throw new Error("locationLabel is required when creating a coordinate location.");
      }

      return this.locationService.ensurePointLocation({
        locationId,
        locationLabel,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        metadata: {
          createdVia,
          userAddress: input.userAddress ?? null,
        },
      });
    }

    if (locationId) {
      throw new Error(
        `Location ${locationId} was not found. Provide GeoJSON or coordinates to register it first.`
      );
    }

    throw new Error(
      "Provide either an existing locationId, a GeoJSON parcel, or latitude/longitude coordinates."
    );
  }
}
