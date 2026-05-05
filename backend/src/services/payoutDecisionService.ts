import { RiskSnapshot } from "../types/riskSnapshot";
import {
  OracleReportPayload,
  PayoutTriggerReason,
} from "../types/payout";

type PolicyInput = {
  id: string;
  threshold_score: number;
  emergency_rain_24h: number;
  active: boolean;
  payout_triggered: boolean;
};

export type PayoutDecision = {
  shouldEnqueue: boolean;
  triggerReason?: PayoutTriggerReason;
  reportPayload?: OracleReportPayload;
};

const buildOracleReport = (snapshot: RiskSnapshot): OracleReportPayload => ({
  observedAt: Math.floor(snapshot.observedAt.getTime() / 1000),
  rain1h: Math.round(snapshot.rain1h),
  rain24h: Math.round(snapshot.rain24h),
  rain72h: Math.round(snapshot.rain72h),
  consecutiveHeavyRainHours: snapshot.consecutiveHeavyRainHours,
  eventDurationHours: snapshot.eventDurationHours,
  windSpeed: Math.round(snapshot.windSpeed),
  temperature: Math.round(snapshot.temperature),
  humidity: Math.round(snapshot.humidity),
  weatherCondition: snapshot.weatherType,
  riskScore: snapshot.riskScore,
});

export class PayoutDecisionService {
  decide(policy: PolicyInput, snapshot: RiskSnapshot): PayoutDecision {
    if (!policy.active || policy.payout_triggered) {
      return { shouldEnqueue: false };
    }

    const triggeredByScore = snapshot.riskScore >= policy.threshold_score;
    const triggeredByRain = snapshot.rain24h > policy.emergency_rain_24h;

    if (!triggeredByScore && !triggeredByRain) {
      return { shouldEnqueue: false };
    }

    return {
      shouldEnqueue: true,
      triggerReason: triggeredByRain ? "rain_24h" : "risk_score",
      reportPayload: buildOracleReport(snapshot),
    };
  }
}
