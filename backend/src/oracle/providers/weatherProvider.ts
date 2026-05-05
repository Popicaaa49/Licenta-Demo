import { OracleLocationConfig } from "../../config/env";

export type OracleWeatherReading = {
  locationId: string;
  timestamp: string;
  rain1h: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  source: string;
  rawPayload?: unknown;
};

export interface WeatherProvider {
  fetchCurrent(location: OracleLocationConfig): Promise<OracleWeatherReading>;
}
