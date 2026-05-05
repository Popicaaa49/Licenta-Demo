import {
  GeoJsonFeature,
  GeoJsonLocationInput,
  GeoJsonPolygonGeometry,
} from "../types/location";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasCoordinates = (value: unknown) =>
  Array.isArray(value) && value.length > 0;

export const extractPolygonGeometry = (input: unknown): GeoJsonPolygonGeometry => {
  if (!isObject(input)) {
    throw new Error("locationGeoJson must be a valid GeoJSON object.");
  }

  if (input.type === "Feature") {
    const feature = input as GeoJsonFeature;
    if (!feature.geometry) {
      throw new Error("GeoJSON Feature must contain a geometry.");
    }

    return extractPolygonGeometry(feature.geometry);
  }

  if (input.type !== "Polygon" && input.type !== "MultiPolygon") {
    throw new Error("Only GeoJSON Polygon or MultiPolygon geometries are supported.");
  }

  if (!hasCoordinates(input.coordinates)) {
    throw new Error("GeoJSON geometry must contain coordinates.");
  }

  return input as GeoJsonPolygonGeometry;
};

export const isGeoJsonLocationInput = (input: unknown): input is GeoJsonLocationInput => {
  try {
    extractPolygonGeometry(input);
    return true;
  } catch {
    return false;
  }
};
