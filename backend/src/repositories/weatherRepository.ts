import { db } from "../db/pool";

export type WeatherRecord = {
  id: string;
  location_id: string;
  timestamp: Date;
  rain_1h: string;
  rain_24h: string;
  wind_speed: string;
  temperature: string;
  humidity: string;
  weather_type: string;
  source: string | null;
  raw_payload: unknown;
};

export type InsertWeatherInput = {
  locationId: string;
  timestamp: Date;
  rain1h: number;
  rain24h: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  source?: string;
  rawPayload?: unknown;
};

export class WeatherRepository {
  async insert(input: InsertWeatherInput) {
    const result = await db.query<WeatherRecord>(
      `INSERT INTO weather_data (
          location_id,
          "timestamp",
          rain_1h,
          rain_24h,
          wind_speed,
          temperature,
          humidity,
          weather_type,
          source,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        RETURNING *`,
      [
        input.locationId,
        input.timestamp,
        input.rain1h,
        input.rain24h,
        input.windSpeed,
        input.temperature,
        input.humidity,
        input.weatherType,
        input.source ?? null,
        JSON.stringify(input.rawPayload ?? {}),
      ]
    );

    return result.rows[0];
  }

  async getLatest(locationId: string) {
    const result = await db.query<WeatherRecord>(
      `SELECT *
       FROM weather_data
       WHERE location_id = $1
       ORDER BY "timestamp" DESC
       LIMIT 1`,
      [locationId]
    );

    return result.rows[0] ?? null;
  }

  async listRecent(locationId: string, hours: number, beforeTimestamp?: Date) {
    const result = await db.query<WeatherRecord>(
      `SELECT *
       FROM weather_data
       WHERE location_id = $1
         AND ($2::timestamptz IS NULL OR "timestamp" < $2)
       ORDER BY "timestamp" DESC
       LIMIT $3`,
      [locationId, beforeTimestamp ?? null, hours]
    );

    return result.rows;
  }
}
