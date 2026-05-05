import { RiskAssessment, Season, WeatherMetrics } from "./types";

const DEFAULT_THRESHOLD_SCORE = 8;
const DEFAULT_EMERGENCY_RAIN_24H = 80;
const SPRING_EMERGENCY_RAIN_24H = 55;

const getSeason = (timestamp: Date): Season => {
  const month = timestamp.getUTCMonth() + 1;

  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
};

const weatherContains = (weatherType: string, token: string) =>
  weatherType.toLowerCase().includes(token.toLowerCase());

const DURATION_ONLY_RULE_CODES = new Set([
  "event_duration_gt_48h",
  "spring_event_duration_gt_24h",
  "spring_event_duration_gt_48h",
]);

type ThresholdConfig = {
  thresholdScore?: number;
  emergencyRain24h?: number;
};

const pushRule = (
  matchedRules: string[],
  explanation: string[],
  ruleCode: string,
  message: string,
  score: number
) => {
  matchedRules.push(ruleCode);
  explanation.push(message);
  return score;
};

const evaluateSummerRules = (metrics: WeatherMetrics) => {
  const matchedRules: string[] = [];
  const explanation: string[] = [];
  let riskScore = 0;

  if (metrics.rain24h > 40) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "rain_24h_gt_40",
      "Rain in 24h exceeded 40 mm/day.",
      2
    );
  }

  if (metrics.rain24h > 70) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "rain_24h_gt_70",
      "Rain in 24h exceeded 70 mm/day.",
      3
    );
  }

  if (metrics.rain1h > 20) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "rain_1h_gt_20",
      "Rain in 1h exceeded 20 mm/hour.",
      2
    );
  }

  if (weatherContains(metrics.weatherType, "thunderstorm")) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "thunderstorm",
      "Thunderstorm condition detected.",
      2
    );
  }

  if (metrics.windSpeed > 15) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "wind_gt_15",
      "Wind speed exceeded 15 m/s.",
      2
    );
  }

  if (metrics.windSpeed > 20) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "wind_gt_20",
      "Wind speed exceeded 20 m/s.",
      3
    );
  }

  if (metrics.humidity > 90 && metrics.rain24h > 20) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "humidity_gt_90_and_rain_24h_gt_20",
      "Humidity exceeded 90% while daily rain exceeded 20 mm.",
      2
    );
  }

  if (metrics.eventDurationHours > 48) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "event_duration_gt_48h",
      "The event duration exceeded 48 hours.",
      2
    );
  }

  if (metrics.temperature > 35) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "temperature_gt_35",
      "Temperature exceeded 35 C.",
      2
    );
  }

  if (metrics.temperature > 40) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "temperature_gt_40",
      "Temperature exceeded 40 C.",
      3
    );
  }

  return { riskScore, matchedRules, explanation };
};

const evaluateSpringRules = (metrics: WeatherMetrics) => {
  const matchedRules: string[] = [];
  const explanation: string[] = [];
  let riskScore = 0;

  if (metrics.rain24h > 20) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_rain_24h_gt_20",
      "Spring rain in 24h exceeded 20 mm/day.",
      2
    );
  }

  if (metrics.rain24h > 35) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_rain_24h_gt_35",
      "Spring rain in 24h exceeded 35 mm/day.",
      3
    );
  }

  if (metrics.rain72h > 45) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_rain_72h_gt_45",
      "Spring rain in 72h exceeded 45 mm.",
      2
    );
  }

  if (metrics.rain72h > 70) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_rain_72h_gt_70",
      "Spring rain in 72h exceeded 70 mm.",
      3
    );
  }

  if (metrics.rain1h > 12) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_rain_1h_gt_12",
      "Spring rain in 1h exceeded 12 mm/hour.",
      2
    );
  }

  if (weatherContains(metrics.weatherType, "thunderstorm")) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_thunderstorm",
      "Spring thunderstorm condition detected.",
      2
    );
  }

  if (metrics.windSpeed > 12) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_wind_gt_12",
      "Spring wind speed exceeded 12 m/s.",
      2
    );
  }

  if (metrics.windSpeed > 18) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_wind_gt_18",
      "Spring wind speed exceeded 18 m/s.",
      3
    );
  }

  if (metrics.humidity > 92 && metrics.rain24h > 15) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_humidity_gt_92_and_rain_24h_gt_15",
      "Humidity exceeded 92% while spring daily rain exceeded 15 mm.",
      1
    );
  }

  if (metrics.eventDurationHours > 24) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_event_duration_gt_24h",
      "The spring event duration exceeded 24 hours.",
      2
    );
  }

  if (metrics.eventDurationHours > 48) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_event_duration_gt_48h",
      "The spring event duration exceeded 48 hours.",
      3
    );
  }

  if (metrics.temperature < 2) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_temperature_lt_2",
      "Spring temperature dropped below 2 C.",
      3
    );
  }

  if (metrics.temperature < 0) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "spring_temperature_lt_0",
      "Spring temperature dropped below 0 C.",
      4
    );
  }

  return { riskScore, matchedRules, explanation };
};

const evaluateFallbackRules = (metrics: WeatherMetrics) => {
  const matchedRules: string[] = [];
  const explanation: string[] = [];
  let riskScore = 0;

  if (metrics.rain24h > 80) {
    riskScore += pushRule(
      matchedRules,
      explanation,
      "rain_24h_emergency",
      "Emergency rainfall threshold exceeded.",
      3
    );
  }

  return { riskScore, matchedRules, explanation };
};

export const buildRiskAssessment = (
  metrics: WeatherMetrics,
  thresholds: ThresholdConfig = {}
): RiskAssessment => {
  const season = getSeason(metrics.timestamp);
  const thresholdScore = thresholds.thresholdScore ?? DEFAULT_THRESHOLD_SCORE;
  const emergencyRain24h =
    thresholds.emergencyRain24h ??
    (season === "spring" ? SPRING_EMERGENCY_RAIN_24H : DEFAULT_EMERGENCY_RAIN_24H);

  const ruleEvaluation =
    season === "spring"
      ? evaluateSpringRules(metrics)
      : season === "summer"
      ? evaluateSummerRules(metrics)
      : evaluateFallbackRules(metrics);
  const eventActive = ruleEvaluation.matchedRules.some(
    (rule) => !DURATION_ONLY_RULE_CODES.has(rule)
  );

  return {
    season,
    riskScore: ruleEvaluation.riskScore,
    payoutTriggered:
      ruleEvaluation.riskScore >= thresholdScore || metrics.rain24h > emergencyRain24h,
    matchedRules: ruleEvaluation.matchedRules,
    explanation: ruleEvaluation.explanation,
    eventActive,
    thresholds: {
      thresholdScore,
      emergencyRain24h,
    },
    metrics,
  };
};

export const getMeteorologicalSeason = getSeason;
