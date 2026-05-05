export type RiskSnapshotRecord = {
  id: string;
  weather_data_id: string;
  location_id: string;
  observed_at: Date;
  season: string;
  risk_score: number;
  event_active: boolean;
  rain_1h: string;
  rain_24h: string;
  rain_72h: string;
  consecutive_heavy_rain_hours: number;
  event_duration_hours: number;
  wind_speed: string;
  temperature: string;
  humidity: string;
  weather_type: string;
  matched_rules: string[];
  explanation: string[];
  calculation_version: string;
  created_at: Date;
};

export type CreateRiskSnapshotInput = {
  weatherDataId: number | string;
  locationId: string;
  observedAt: Date;
  season: string;
  riskScore: number;
  eventActive: boolean;
  rain1h: number;
  rain24h: number;
  rain72h: number;
  consecutiveHeavyRainHours: number;
  eventDurationHours: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  matchedRules: string[];
  explanation: string[];
  calculationVersion?: string;
};

export type RiskSnapshot = {
  id: number;
  weatherDataId: number;
  locationId: string;
  observedAt: Date;
  season: string;
  riskScore: number;
  eventActive: boolean;
  rain1h: number;
  rain24h: number;
  rain72h: number;
  consecutiveHeavyRainHours: number;
  eventDurationHours: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  matchedRules: string[];
  explanation: string[];
  calculationVersion: string;
  createdAt: Date;
};

export type RiskSnapshotDto = {
  id: number;
  locationId: string;
  observedAt: string;
  season: string;
  riskScore: number;
  eventActive: boolean;
  rain1h: number;
  rain24h: number;
  rain72h: number;
  consecutiveHeavyRainHours: number;
  eventDurationHours: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  matchedRules: string[];
  explanation: string[];
  calculationVersion: string;
};

const toNumber = (value: string | number) =>
  typeof value === "number" ? value : Number(value);

export const mapRiskSnapshotRecord = (record: RiskSnapshotRecord): RiskSnapshot => ({
  id: Number(record.id),
  weatherDataId: Number(record.weather_data_id),
  locationId: record.location_id,
  observedAt: record.observed_at,
  season: record.season,
  riskScore: record.risk_score,
  eventActive: record.event_active,
  rain1h: toNumber(record.rain_1h),
  rain24h: toNumber(record.rain_24h),
  rain72h: toNumber(record.rain_72h),
  consecutiveHeavyRainHours: record.consecutive_heavy_rain_hours,
  eventDurationHours: record.event_duration_hours,
  windSpeed: toNumber(record.wind_speed),
  temperature: toNumber(record.temperature),
  humidity: toNumber(record.humidity),
  weatherType: record.weather_type,
  matchedRules: record.matched_rules ?? [],
  explanation: record.explanation ?? [],
  calculationVersion: record.calculation_version,
  createdAt: record.created_at,
});

export const toRiskSnapshotDto = (snapshot: RiskSnapshot): RiskSnapshotDto => ({
  id: snapshot.id,
  locationId: snapshot.locationId,
  observedAt: snapshot.observedAt.toISOString(),
  season: snapshot.season,
  riskScore: snapshot.riskScore,
  eventActive: snapshot.eventActive,
  rain1h: snapshot.rain1h,
  rain24h: snapshot.rain24h,
  rain72h: snapshot.rain72h,
  consecutiveHeavyRainHours: snapshot.consecutiveHeavyRainHours,
  eventDurationHours: snapshot.eventDurationHours,
  windSpeed: snapshot.windSpeed,
  temperature: snapshot.temperature,
  humidity: snapshot.humidity,
  weatherType: snapshot.weatherType,
  matchedRules: snapshot.matchedRules,
  explanation: snapshot.explanation,
  calculationVersion: snapshot.calculationVersion,
});
