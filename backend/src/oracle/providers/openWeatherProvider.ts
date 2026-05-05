import { ensureConfigured, env, OracleLocationConfig } from "../../config/env";
import { OracleWeatherReading, WeatherProvider } from "./weatherProvider";

type OpenWeatherResponse = {
  dt?: number;
  rain?: {
    ["1h"]?: number;
  };
  wind?: {
    speed?: number;
  };
  main?: {
    temp?: number;
    humidity?: number;
  };
  weather?: Array<{
    main?: string;
    description?: string;
  }>;
};

export class OpenWeatherProvider implements WeatherProvider {
  constructor() {
    ensureConfigured([["OPENWEATHER_API_KEY", env.openWeatherApiKey]]);
  }

  async fetchCurrent(location: OracleLocationConfig): Promise<OracleWeatherReading> {
    const url = new URL("/data/2.5/weather", env.openWeatherBaseUrl);
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));
    url.searchParams.set("appid", env.openWeatherApiKey);
    url.searchParams.set("units", env.openWeatherUnits);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `OpenWeather request failed for ${location.locationId}: ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as OpenWeatherResponse;

    return {
      locationId: location.locationId,
      timestamp: new Date((payload.dt ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      rain1h: Number(payload.rain?.["1h"] ?? 0),
      windSpeed: Number(payload.wind?.speed ?? 0),
      temperature: Number(payload.main?.temp ?? 0),
      humidity: Number(payload.main?.humidity ?? 0),
      weatherType:
        payload.weather?.[0]?.main ||
        payload.weather?.[0]?.description ||
        "unknown",
      source: "openweather",
      rawPayload: payload,
    };
  }
}
