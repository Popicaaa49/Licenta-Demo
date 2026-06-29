import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPolicyTriggerConfiguration,
  buildRiskAssessment,
  RISK_MODEL_VERSION,
} from "./riskEngine";
import { WeatherMetrics } from "./types";

const metrics = (timestamp: string, overrides: Partial<WeatherMetrics> = {}): WeatherMetrics => ({
  locationId: "RO-TM-001",
  timestamp: new Date(timestamp),
  rain1h: 0,
  rain24h: 0,
  rain72h: 0,
  windSpeed: 0,
  temperature: 20,
  humidity: 50,
  weatherType: "clear",
  consecutiveHeavyRainHours: 0,
  eventDurationHours: 0,
  ...overrides,
});

test("summer rainfall severity is exclusive instead of accumulating overlapping rules", () => {
  const assessment = buildRiskAssessment(metrics("2026-07-15T12:00:00.000Z", { rain24h: 71 }));

  assert.equal(assessment.riskScore, 5);
  assert.deepEqual(assessment.matchedRules, ["summer_rain_24h_gt_70"]);
  assert.equal(assessment.calculationVersion, RISK_MODEL_VERSION);
});

test("summer assessment uses accumulated rainfall and persistent heavy rain", () => {
  const assessment = buildRiskAssessment(
    metrics("2026-07-15T12:00:00.000Z", {
      rain72h: 111,
      consecutiveHeavyRainHours: 7,
    })
  );

  assert.equal(assessment.riskScore, 6);
  assert.deepEqual(assessment.matchedRules, [
    "summer_rain_72h_gt_110",
    "summer_consecutive_heavy_rain_gt_6h",
  ]);
  assert.equal(assessment.eventActive, true);
});

test("spring rainfall thresholds do not double count the same meteorological dimension", () => {
  const assessment = buildRiskAssessment(metrics("2026-04-15T12:00:00.000Z", { rain24h: 36 }));

  assert.equal(assessment.riskScore, 3);
  assert.deepEqual(assessment.matchedRules, ["spring_rain_24h_gt_35"]);
});

test("autumn and winter use dedicated seasonal rules", () => {
  const autumn = buildRiskAssessment(metrics("2026-10-15T12:00:00.000Z", { rain24h: 61 }));
  const winter = buildRiskAssessment(metrics("2026-01-15T12:00:00.000Z", { temperature: -6 }));

  assert.deepEqual(autumn.matchedRules, ["autumn_rain_24h_gt_60"]);
  assert.deepEqual(winter.matchedRules, ["winter_temperature_lt_minus_5"]);
});

test("policy trigger terms are derived from risk, crop, and season", () => {
  const configuration = buildPolicyTriggerConfiguration({
    cropType: "potato",
    coverageStart: new Date("2026-04-15T12:00:00.000Z"),
    riskTier: "severe",
  });

  assert.deepEqual(configuration, {
    season: "spring",
    thresholdScore: 5,
    emergencyRain24h: 35,
    riskModelVersion: RISK_MODEL_VERSION,
  });
});
