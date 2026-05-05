import { env } from "../config/env";
import { buildRiskAssessment } from "../risk/riskEngine";
import { WeatherMetrics } from "../risk/types";

const HEAVY_RAIN_THRESHOLD = 20;

const weatherCodeToLabel = (weatherCode: number) => {
  if ([95, 96, 99].includes(weatherCode)) {
    return "thunderstorm";
  }

  if ([80, 81, 82].includes(weatherCode)) {
    return "rain showers";
  }

  if ([61, 63, 65].includes(weatherCode)) {
    return "rain";
  }

  if ([51, 53, 55].includes(weatherCode)) {
    return "drizzle";
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return "snow";
  }

  if ([45, 48].includes(weatherCode)) {
    return "fog";
  }

  if (weatherCode === 0) {
    return "clear";
  }

  if ([1, 2, 3].includes(weatherCode)) {
    return "cloudy";
  }

  return "unknown";
};

const roundMetric = (value: number) => Number(value.toFixed(2));

const calculateEventDurationHours = (startTime: Date, observedAt: Date) =>
  Math.max(1, Math.floor((observedAt.getTime() - startTime.getTime()) / 3_600_000) + 1);

type OpenMeteoArchiveResponse = {
  hourly_units?: Record<string, string>;
  hourly?: {
    time?: string[];
    precipitation?: Array<number | null>;
    temperature_2m?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
};

export type HistoricalUnderwritingMetrics = {
  sampleCount: number;
  severeEvents90d: number;
  averageRiskScore: number;
  maxRiskScore: number;
  maxRain24h: number;
  maxRain1h: number;
  maxWindSpeed: number;
  maxTemperature: number;
  source: "open-meteo";
};

export class OpenMeteoHistoricalUnderwritingService {
  async buildMetrics(input: {
    locationId: string;
    latitude: number;
    longitude: number;
    endDate?: Date;
    historyDays?: number;
  }): Promise<HistoricalUnderwritingMetrics> {
    const historyDays = input.historyDays ?? env.underwritingHistoryDays;
    const endDate = input.endDate ?? new Date();
    const startDate = new Date(endDate.getTime() - (historyDays - 1) * 24 * 60 * 60 * 1000);

    const url = new URL("/v1/archive", env.openMeteoArchiveBaseUrl);
    url.searchParams.set("latitude", String(input.latitude));
    url.searchParams.set("longitude", String(input.longitude));
    url.searchParams.set("start_date", startDate.toISOString().slice(0, 10));
    url.searchParams.set("end_date", endDate.toISOString().slice(0, 10));
    url.searchParams.set(
      "hourly",
      "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code"
    );
    url.searchParams.set("timezone", "GMT");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Open-Meteo archive request failed for ${input.locationId}: ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as OpenMeteoArchiveResponse;
    const times = payload.hourly?.time ?? [];
    const precipitation = payload.hourly?.precipitation ?? [];
    const temperature = payload.hourly?.temperature_2m ?? [];
    const humidity = payload.hourly?.relative_humidity_2m ?? [];
    const windSpeed = payload.hourly?.wind_speed_10m ?? [];
    const weatherCode = payload.hourly?.weather_code ?? [];

    if (
      times.length === 0 ||
      precipitation.length !== times.length ||
      temperature.length !== times.length ||
      humidity.length !== times.length ||
      windSpeed.length !== times.length ||
      weatherCode.length !== times.length
    ) {
      throw new Error(`Open-Meteo archive returned incomplete hourly data for ${input.locationId}.`);
    }

    const hourlyRain = precipitation.map((value) => Number(value ?? 0));

    let severeEvents90d = 0;
    let totalRiskScore = 0;
    let maxRiskScore = 0;
    let maxRain24h = 0;
    let maxRain1h = 0;
    let maxWindSpeed = 0;
    let maxTemperature = 0;
    let openEventStartTime: Date | null = null;

    for (let index = 0; index < times.length; index += 1) {
      const timestamp = new Date(times[index]);
      const rain1h = roundMetric(hourlyRain[index] ?? 0);

      let rain24h = 0;
      for (let offset = Math.max(0, index - 23); offset <= index; offset += 1) {
        rain24h += hourlyRain[offset] ?? 0;
      }
      rain24h = roundMetric(rain24h);

      let rain72h = 0;
      for (let offset = Math.max(0, index - 71); offset <= index; offset += 1) {
        rain72h += hourlyRain[offset] ?? 0;
      }
      rain72h = roundMetric(rain72h);

      let consecutiveHeavyRainHours = 0;
      if (rain1h > HEAVY_RAIN_THRESHOLD) {
        consecutiveHeavyRainHours = 1;
        for (let offset = index - 1; offset >= 0; offset -= 1) {
          if ((hourlyRain[offset] ?? 0) > HEAVY_RAIN_THRESHOLD) {
            consecutiveHeavyRainHours += 1;
            continue;
          }

          break;
        }
      }

      const baseMetrics: WeatherMetrics = {
        locationId: input.locationId,
        timestamp,
        rain1h,
        rain24h,
        rain72h,
        windSpeed: roundMetric(Number(windSpeed[index] ?? 0)),
        temperature: roundMetric(Number(temperature[index] ?? 0)),
        humidity: roundMetric(Number(humidity[index] ?? 0)),
        weatherType: weatherCodeToLabel(Number(weatherCode[index] ?? -1)),
        consecutiveHeavyRainHours,
        eventDurationHours: 0,
      };

      const provisionalAssessment = buildRiskAssessment(baseMetrics);
      const eventStartTime =
        provisionalAssessment.eventActive && openEventStartTime ? openEventStartTime : timestamp;
      const finalMetrics: WeatherMetrics = {
        ...baseMetrics,
        eventDurationHours: provisionalAssessment.eventActive
          ? calculateEventDurationHours(eventStartTime, timestamp)
          : 0,
      };
      const finalAssessment = buildRiskAssessment(finalMetrics);

      if (finalAssessment.eventActive) {
        if (!openEventStartTime) {
          openEventStartTime = timestamp;
        }
      } else {
        openEventStartTime = null;
      }

      totalRiskScore += finalAssessment.riskScore;
      if (
        finalAssessment.riskScore >= 8 ||
        finalMetrics.rain24h > 80
      ) {
        severeEvents90d += 1;
      }

      if (finalAssessment.riskScore > maxRiskScore) {
        maxRiskScore = finalAssessment.riskScore;
      }
      if (finalMetrics.rain24h > maxRain24h) {
        maxRain24h = finalMetrics.rain24h;
      }
      if (finalMetrics.rain1h > maxRain1h) {
        maxRain1h = finalMetrics.rain1h;
      }
      if (finalMetrics.windSpeed > maxWindSpeed) {
        maxWindSpeed = finalMetrics.windSpeed;
      }
      if (finalMetrics.temperature > maxTemperature) {
        maxTemperature = finalMetrics.temperature;
      }
    }

    return {
      sampleCount: times.length,
      severeEvents90d,
      averageRiskScore: roundMetric(totalRiskScore / times.length),
      maxRiskScore,
      maxRain24h,
      maxRain1h,
      maxWindSpeed,
      maxTemperature,
      source: "open-meteo",
    };
  }
}
