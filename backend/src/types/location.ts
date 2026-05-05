export type GeoJsonPolygonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type GeoJsonFeature = {
  type: "Feature";
  geometry: GeoJsonPolygonGeometry | null;
  properties?: Record<string, unknown> | null;
};

export type GeoJsonLocationInput = GeoJsonPolygonGeometry | GeoJsonFeature;

export type LocationRecord = {
  location_id: string;
  location_label: string;
  source_type: string;
  latitude: string;
  longitude: string;
  area_hectares: string | null;
  geometry_geojson?: GeoJsonPolygonGeometry | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type InsuredLocation = {
  locationId: string;
  locationLabel: string;
  sourceType: string;
  latitude: number;
  longitude: number;
  areaHectares: number | null;
  geometryGeoJson: GeoJsonPolygonGeometry | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const toNumber = (value: string | number | null) => {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
};

export const mapLocationRecord = (record: LocationRecord): InsuredLocation => ({
  locationId: record.location_id,
  locationLabel: record.location_label,
  sourceType: record.source_type,
  latitude: Number(record.latitude),
  longitude: Number(record.longitude),
  areaHectares: toNumber(record.area_hectares),
  geometryGeoJson: record.geometry_geojson ?? null,
  metadata: record.metadata ?? {},
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});
