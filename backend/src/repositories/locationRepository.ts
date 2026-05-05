import { db } from "../db/pool";
import { GeoJsonPolygonGeometry, LocationRecord, mapLocationRecord } from "../types/location";

export class LocationRepository {
  async createFromGeoJson(input: {
    locationId: string;
    locationLabel: string;
    sourceType: string;
    geometry: GeoJsonPolygonGeometry;
    metadata?: Record<string, unknown>;
  }) {
    const geometryJson = JSON.stringify(input.geometry);
    const metadataJson = JSON.stringify(input.metadata ?? {});

    const result = await db.query<LocationRecord>(
      `WITH raw AS (
          SELECT ST_SetSRID(ST_GeomFromGeoJSON($4), 4326) AS geom
        ),
        normalized AS (
          SELECT CASE
                   WHEN GeometryType(geom) = 'POLYGON' THEN ST_Multi(geom)
                   WHEN GeometryType(geom) = 'MULTIPOLYGON' THEN geom::geometry(MultiPolygon, 4326)
                   ELSE NULL
                 END AS geom
          FROM raw
        )
        INSERT INTO locations (
          location_id,
          location_label,
          source_type,
          geometry,
          centroid,
          area_hectares,
          bbox,
          metadata
        )
        SELECT
          $1,
          $2,
          $3,
          geom,
          ST_PointOnSurface(geom),
          ROUND((ST_Area(ST_Transform(geom, 3857)) / 10000.0)::numeric, 4),
          ST_Envelope(geom),
          $5::jsonb
        FROM normalized
        WHERE geom IS NOT NULL AND ST_IsValid(geom)
        RETURNING
          location_id,
          location_label,
          source_type,
          ST_Y(centroid)::text AS latitude,
          ST_X(centroid)::text AS longitude,
          area_hectares::text,
          ST_AsGeoJSON(geometry)::jsonb AS geometry_geojson,
          metadata,
          created_at,
          updated_at`,
      [input.locationId, input.locationLabel, input.sourceType, geometryJson, metadataJson]
    );

    if (!result.rows[0]) {
      throw new Error("Failed to store GeoJSON location. Ensure the polygon is valid.");
    }

    return mapLocationRecord(result.rows[0]);
  }

  async createPointLocation(input: {
    locationId: string;
    locationLabel: string;
    latitude: number;
    longitude: number;
    sourceType: string;
    metadata?: Record<string, unknown>;
  }) {
    const result = await db.query<LocationRecord>(
      `INSERT INTO locations (
          location_id,
          location_label,
          source_type,
          geometry,
          centroid,
          area_hectares,
          bbox,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          NULL,
          ST_SetSRID(ST_MakePoint($4, $5), 4326),
          NULL,
          NULL,
          $6::jsonb
        )
        RETURNING
          location_id,
          location_label,
          source_type,
          ST_Y(centroid)::text AS latitude,
          ST_X(centroid)::text AS longitude,
          area_hectares::text,
          NULL::jsonb AS geometry_geojson,
          metadata,
          created_at,
          updated_at`,
      [
        input.locationId,
        input.locationLabel,
        input.sourceType,
        input.longitude,
        input.latitude,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    return mapLocationRecord(result.rows[0]);
  }

  async getById(locationId: string) {
    const result = await db.query<LocationRecord>(
      `SELECT
          location_id,
          location_label,
          source_type,
          ST_Y(centroid)::text AS latitude,
          ST_X(centroid)::text AS longitude,
          area_hectares::text,
          CASE
            WHEN geometry IS NULL THEN NULL::jsonb
            ELSE ST_AsGeoJSON(geometry)::jsonb
          END AS geometry_geojson,
          metadata,
          created_at,
          updated_at
       FROM locations
       WHERE location_id = $1`,
      [locationId]
    );

    return result.rows[0] ? mapLocationRecord(result.rows[0]) : null;
  }

  async listAll() {
    const result = await db.query<LocationRecord>(
      `SELECT
          location_id,
          location_label,
          source_type,
          ST_Y(centroid)::text AS latitude,
          ST_X(centroid)::text AS longitude,
          area_hectares::text,
          NULL::jsonb AS geometry_geojson,
          metadata,
          created_at,
          updated_at
       FROM locations
       ORDER BY updated_at DESC, location_id ASC`
    );

    return result.rows.map(mapLocationRecord);
  }
}
