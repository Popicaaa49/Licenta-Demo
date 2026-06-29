import { RiskAssessment, Season, WeatherMetrics } from "./types";

export const RISK_MODEL_VERSION = "risk-engine:v2";

type RiskTier = "low" | "medium" | "high" | "severe";

export type TriggerConfiguration = {
  season: Season;
  thresholdScore: number;
  emergencyRain24h: number;
  riskModelVersion: string;
};

type ThresholdConfig = {
  thresholdScore?: number;
  emergencyRain24h?: number;
};

type RuleEvaluation = {
  riskScore: number;
  matchedRules: string[];
  explanation: string[];
};

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
  "summer_event_duration_gt_48h",
  "spring_event_duration_gt_24h",
  "spring_event_duration_gt_48h",
  "autumn_event_duration_gt_36h",
  "winter_event_duration_gt_24h",
]);

const SEASON_TRIGGER_BASELINES: Record<Season, Omit<TriggerConfiguration, "season" | "riskModelVersion">> = {
  spring: { thresholdScore: 7, emergencyRain24h: 55 },
  summer: { thresholdScore: 8, emergencyRain24h: 80 },
  autumn: { thresholdScore: 8, emergencyRain24h: 70 },
  winter: { thresholdScore: 7, emergencyRain24h: 55 },
};

const CROP_TRIGGER_ADJUSTMENTS: Record<string, { thresholdScore: number; emergencyRain24h: number }> = {
  potato: { thresholdScore: -1, emergencyRain24h: -10 },
  rapeseed: { thresholdScore: -1, emergencyRain24h: -5 },
};

const TIER_TRIGGER_ADJUSTMENTS: Record<RiskTier, { thresholdScore: number; emergencyRain24h: number }> = {
  low: { thresholdScore: 0, emergencyRain24h: 0 },
  medium: { thresholdScore: 0, emergencyRain24h: 0 },
  high: { thresholdScore: -1, emergencyRain24h: -5 },
  severe: { thresholdScore: -1, emergencyRain24h: -10 },
};

const addRule = (
  evaluation: RuleEvaluation,
  ruleCode: string,
  message: string,
  score: number
) => {
  evaluation.matchedRules.push(ruleCode);
  evaluation.explanation.push(message);
  evaluation.riskScore += score;
};

const createEvaluation = (): RuleEvaluation => ({
  riskScore: 0,
  matchedRules: [],
  explanation: [],
});

const evaluateSummerRules = (metrics: WeatherMetrics): RuleEvaluation => {
  const evaluation = createEvaluation();

  if (metrics.rain24h > 70) {
    addRule(evaluation, "summer_rain_24h_gt_70", "Summer rain in 24h exceeded 70 mm/day.", 5);
  } else if (metrics.rain24h > 40) {
    addRule(evaluation, "summer_rain_24h_gt_40", "Summer rain in 24h exceeded 40 mm/day.", 2);
  }

  if (metrics.rain72h > 110) {
    addRule(evaluation, "summer_rain_72h_gt_110", "Summer rain in 72h exceeded 110 mm.", 3);
  } else if (metrics.rain72h > 70) {
    addRule(evaluation, "summer_rain_72h_gt_70", "Summer rain in 72h exceeded 70 mm.", 1);
  }

  if (metrics.rain1h > 20) {
    addRule(evaluation, "summer_rain_1h_gt_20", "Summer rain in 1h exceeded 20 mm/hour.", 2);
  }

  if (metrics.consecutiveHeavyRainHours > 6) {
    addRule(
      evaluation,
      "summer_consecutive_heavy_rain_gt_6h",
      "Heavy summer rain persisted for more than 6 consecutive hours.",
      3
    );
  } else if (metrics.consecutiveHeavyRainHours > 3) {
    addRule(
      evaluation,
      "summer_consecutive_heavy_rain_gt_3h",
      "Heavy summer rain persisted for more than 3 consecutive hours.",
      1
    );
  }

  if (weatherContains(metrics.weatherType, "thunderstorm")) {
    addRule(evaluation, "summer_thunderstorm", "Summer thunderstorm condition detected.", 2);
  }

  if (metrics.windSpeed > 20) {
    addRule(evaluation, "summer_wind_gt_20", "Summer wind speed exceeded 20 m/s.", 3);
  } else if (metrics.windSpeed > 15) {
    addRule(evaluation, "summer_wind_gt_15", "Summer wind speed exceeded 15 m/s.", 2);
  }

  if (metrics.humidity > 90 && metrics.rain24h > 20) {
    addRule(
      evaluation,
      "summer_humidity_gt_90_and_rain_24h_gt_20",
      "Humidity exceeded 90% while daily summer rain exceeded 20 mm.",
      2
    );
  }

  if (metrics.eventDurationHours > 48) {
    addRule(
      evaluation,
      "summer_event_duration_gt_48h",
      "The summer event duration exceeded 48 hours.",
      2
    );
  }

  if (metrics.temperature > 40) {
    addRule(evaluation, "summer_temperature_gt_40", "Summer temperature exceeded 40 C.", 3);
  } else if (metrics.temperature > 35) {
    addRule(evaluation, "summer_temperature_gt_35", "Summer temperature exceeded 35 C.", 2);
  }

  return evaluation;
};

const evaluateSpringRules = (metrics: WeatherMetrics): RuleEvaluation => {
  const evaluation = createEvaluation();

  if (metrics.rain24h > 35) {
    addRule(evaluation, "spring_rain_24h_gt_35", "Spring rain in 24h exceeded 35 mm/day.", 3);
  } else if (metrics.rain24h > 20) {
    addRule(evaluation, "spring_rain_24h_gt_20", "Spring rain in 24h exceeded 20 mm/day.", 2);
  }

  if (metrics.rain72h > 70) {
    addRule(evaluation, "spring_rain_72h_gt_70", "Spring rain in 72h exceeded 70 mm.", 3);
  } else if (metrics.rain72h > 45) {
    addRule(evaluation, "spring_rain_72h_gt_45", "Spring rain in 72h exceeded 45 mm.", 2);
  }

  if (metrics.rain1h > 12) {
    addRule(evaluation, "spring_rain_1h_gt_12", "Spring rain in 1h exceeded 12 mm/hour.", 2);
  }

  if (metrics.consecutiveHeavyRainHours > 5) {
    addRule(
      evaluation,
      "spring_consecutive_heavy_rain_gt_5h",
      "Heavy spring rain persisted for more than 5 consecutive hours.",
      2
    );
  }

  if (weatherContains(metrics.weatherType, "thunderstorm")) {
    addRule(evaluation, "spring_thunderstorm", "Spring thunderstorm condition detected.", 2);
  }

  if (metrics.windSpeed > 18) {
    addRule(evaluation, "spring_wind_gt_18", "Spring wind speed exceeded 18 m/s.", 3);
  } else if (metrics.windSpeed > 12) {
    addRule(evaluation, "spring_wind_gt_12", "Spring wind speed exceeded 12 m/s.", 2);
  }

  if (metrics.humidity > 92 && metrics.rain24h > 15) {
    addRule(
      evaluation,
      "spring_humidity_gt_92_and_rain_24h_gt_15",
      "Humidity exceeded 92% while spring daily rain exceeded 15 mm.",
      1
    );
  }

  if (metrics.eventDurationHours > 48) {
    addRule(
      evaluation,
      "spring_event_duration_gt_48h",
      "The spring event duration exceeded 48 hours.",
      3
    );
  } else if (metrics.eventDurationHours > 24) {
    addRule(
      evaluation,
      "spring_event_duration_gt_24h",
      "The spring event duration exceeded 24 hours.",
      2
    );
  }

  if (metrics.temperature < 0) {
    addRule(evaluation, "spring_temperature_lt_0", "Spring temperature dropped below 0 C.", 4);
  } else if (metrics.temperature < 2) {
    addRule(evaluation, "spring_temperature_lt_2", "Spring temperature dropped below 2 C.", 3);
  }

  return evaluation;
};

const evaluateAutumnRules = (metrics: WeatherMetrics): RuleEvaluation => {
  const evaluation = createEvaluation();

  if (metrics.rain24h > 60) {
    addRule(evaluation, "autumn_rain_24h_gt_60", "Autumn rain in 24h exceeded 60 mm/day.", 4);
  } else if (metrics.rain24h > 35) {
    addRule(evaluation, "autumn_rain_24h_gt_35", "Autumn rain in 24h exceeded 35 mm/day.", 2);
  }

  if (metrics.rain72h > 90) {
    addRule(evaluation, "autumn_rain_72h_gt_90", "Autumn rain in 72h exceeded 90 mm.", 3);
  }

  if (metrics.consecutiveHeavyRainHours > 4) {
    addRule(
      evaluation,
      "autumn_consecutive_heavy_rain_gt_4h",
      "Heavy autumn rain persisted for more than 4 consecutive hours.",
      2
    );
  }

  if (metrics.windSpeed > 18) {
    addRule(evaluation, "autumn_wind_gt_18", "Autumn wind speed exceeded 18 m/s.", 3);
  }

  if (metrics.eventDurationHours > 36) {
    addRule(
      evaluation,
      "autumn_event_duration_gt_36h",
      "The autumn event duration exceeded 36 hours.",
      2
    );
  }

  return evaluation;
};

const evaluateWinterRules = (metrics: WeatherMetrics): RuleEvaluation => {
  const evaluation = createEvaluation();

  if (metrics.temperature < -5) {
    addRule(evaluation, "winter_temperature_lt_minus_5", "Winter temperature dropped below -5 C.", 4);
  } else if (metrics.temperature < 0) {
    addRule(evaluation, "winter_temperature_lt_0", "Winter temperature dropped below 0 C.", 3);
  }

  if (metrics.rain24h > 45) {
    addRule(evaluation, "winter_rain_24h_gt_45", "Winter rain in 24h exceeded 45 mm/day.", 3);
  }

  if (metrics.windSpeed > 18) {
    addRule(evaluation, "winter_wind_gt_18", "Winter wind speed exceeded 18 m/s.", 3);
  }

  if (metrics.eventDurationHours > 24) {
    addRule(
      evaluation,
      "winter_event_duration_gt_24h",
      "The winter event duration exceeded 24 hours.",
      2
    );
  }

  return evaluation;
};

export const buildPolicyTriggerConfiguration = (input: {
  cropType: string;
  coverageStart: Date;
  riskTier: RiskTier;
}): TriggerConfiguration => {
  const season = getSeason(input.coverageStart);
  const baseline = SEASON_TRIGGER_BASELINES[season];
  const cropAdjustment = CROP_TRIGGER_ADJUSTMENTS[input.cropType.toLowerCase()] ?? {
    thresholdScore: 0,
    emergencyRain24h: 0,
  };
  const tierAdjustment = TIER_TRIGGER_ADJUSTMENTS[input.riskTier];

  return {
    season,
    thresholdScore: Math.max(1, baseline.thresholdScore + cropAdjustment.thresholdScore + tierAdjustment.thresholdScore),
    emergencyRain24h: Math.max(
      1,
      baseline.emergencyRain24h + cropAdjustment.emergencyRain24h + tierAdjustment.emergencyRain24h
    ),
    riskModelVersion: RISK_MODEL_VERSION,
  };
};

export const buildRiskAssessment = (
  metrics: WeatherMetrics,
  thresholds: ThresholdConfig = {}
): RiskAssessment => {
  const season = getSeason(metrics.timestamp);
  const baseline = SEASON_TRIGGER_BASELINES[season];
  const thresholdScore = thresholds.thresholdScore ?? baseline.thresholdScore;
  const emergencyRain24h = thresholds.emergencyRain24h ?? baseline.emergencyRain24h;

  const ruleEvaluation =
    season === "spring"
      ? evaluateSpringRules(metrics)
      : season === "summer"
      ? evaluateSummerRules(metrics)
      : season === "autumn"
      ? evaluateAutumnRules(metrics)
      : evaluateWinterRules(metrics);
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
    calculationVersion: RISK_MODEL_VERSION,
    thresholds: {
      thresholdScore,
      emergencyRain24h,
    },
    metrics,
  };
};

export const getMeteorologicalSeason = getSeason;
