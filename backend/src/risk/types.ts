export type Season = "spring" | "summer" | "autumn" | "winter";

export type WeatherMetrics = {
  locationId: string;
  timestamp: Date;
  rain1h: number;
  rain24h: number;
  rain72h: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  consecutiveHeavyRainHours: number;
  eventDurationHours: number;
};

export type RiskAssessment = {
  season: Season;
  riskScore: number;
  payoutTriggered: boolean;
  matchedRules: string[];
  explanation: string[];
  eventActive: boolean;
  thresholds: {
    thresholdScore: number;
    emergencyRain24h: number;
  };
  metrics: WeatherMetrics;
};
