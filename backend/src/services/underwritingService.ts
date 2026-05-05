import { env } from "../config/env";
import { CropReferenceRepository } from "../repositories/cropReferenceRepository";
import { LocationRepository } from "../repositories/locationRepository";
import { RiskSnapshotRepository } from "../repositories/riskSnapshotRepository";
import { OpenMeteoHistoricalUnderwritingService } from "./openMeteoHistoricalUnderwritingService";

const OPS_FEE_RATE = 0.005;
const SEVERE_TRIGGER_SCORE = 8;
const SEVERE_TRIGGER_RAIN_24H = 80;
const HISTORY_LIMIT = 24 * 90;

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const maxOrZero = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values);
};

type QuoteMetrics = {
  riskTier: "low" | "medium" | "high" | "severe";
  severeEvents90d: number;
  averageRiskScore: number;
  maxRiskScore: number;
  maxRain24h: number;
  maxRain1h: number;
  maxWindSpeed: number;
  maxTemperature: number;
  locationRiskMultiplier: number;
  seasonMultiplier: number;
  expectedRevenuePerHaEur: number;
  insuredAmountPerHaEur: number;
  payoutCapEur: number;
  premiumRate: number;
  premiumAmountEur: number;
  breakdown: Record<string, unknown>;
};

type HistoryMetrics = {
  sampleCount: number;
  severeEvents90d: number;
  averageRiskScore: number;
  maxRiskScore: number;
  maxRain24h: number;
  maxRain1h: number;
  maxWindSpeed: number;
  maxTemperature: number;
  source: "local" | "open-meteo" | "fallback";
  warning?: string;
};

export class UnderwritingService {
  constructor(
    private readonly cropReferenceRepository = new CropReferenceRepository(),
    private readonly riskSnapshotRepository = new RiskSnapshotRepository(),
    private readonly locationRepository = new LocationRepository(),
    private readonly historicalUnderwritingService = new OpenMeteoHistoricalUnderwritingService()
  ) {}

  async listCropCatalog() {
    return this.cropReferenceRepository.listActive();
  }

  async buildQuote(input: {
    locationId: string;
    cropType: string;
    areaHa: number;
    coverageStart: Date;
    coverageEnd: Date;
  }): Promise<QuoteMetrics> {
    const crop = await this.cropReferenceRepository.getByCropType(input.cropType);
    if (!crop || !crop.active) {
      throw new Error(`Unsupported cropType: ${input.cropType}`);
    }

    const historyMetrics = await this.resolveHistoryMetrics(input.locationId);
    const severeEvents90d = historyMetrics.severeEvents90d;
    const averageRiskScore = historyMetrics.averageRiskScore;
    const maxRiskScore = historyMetrics.maxRiskScore;
    const maxRain24h = historyMetrics.maxRain24h;
    const maxRain1h = historyMetrics.maxRain1h;
    const maxWindSpeed = historyMetrics.maxWindSpeed;
    const maxTemperature = historyMetrics.maxTemperature;

    let riskTier: QuoteMetrics["riskTier"] = "low";
    if (
      severeEvents90d >= 4 ||
      maxRain24h > 100 ||
      maxRiskScore >= 12 ||
      maxWindSpeed > 22
    ) {
      riskTier = "severe";
    } else if (
      severeEvents90d >= 2 ||
      maxRain24h >= 80 ||
      maxRiskScore >= 10 ||
      maxWindSpeed > 18
    ) {
      riskTier = "high";
    } else if (
      severeEvents90d >= 1 ||
      maxRain24h >= 50 ||
      maxRiskScore >= 7 ||
      maxTemperature > 35
    ) {
      riskTier = "medium";
    }

    const locationRiskMultiplier =
      riskTier === "low" ? 0.9 : riskTier === "medium" ? 1 : riskTier === "high" ? 1.15 : 1.35;

    const coverageDays = Math.max(
      1,
      Math.ceil((input.coverageEnd.getTime() - input.coverageStart.getTime()) / (24 * 60 * 60 * 1000))
    );

    const seasonMultiplier =
      coverageDays <= crop.referenceSeasonDays
        ? 1
        : coverageDays <= Math.round(crop.referenceSeasonDays * 1.25)
          ? 1.15
          : coverageDays <= Math.round(crop.referenceSeasonDays * 1.5)
            ? 1.35
            : 1.6;

    const expectedRevenuePerHaEur = crop.expectedYieldTHa * crop.referencePriceEurT;
    const expectedMarginPerHaEur = Math.max(
      0,
      expectedRevenuePerHaEur - crop.productionCostEurHa
    );
    const insuredAmountPerHaEur = Math.min(
      crop.productionCostEurHa * 0.85 + expectedMarginPerHaEur * 0.25,
      crop.productionCostEurHa * 1.15
    );
    const payoutCapEur = insuredAmountPerHaEur * input.areaHa;
    const premiumRate =
      crop.basePremiumRate * locationRiskMultiplier * seasonMultiplier + OPS_FEE_RATE;
    const premiumAmountEur = payoutCapEur * premiumRate;

    return {
      riskTier,
      severeEvents90d,
      averageRiskScore: round(averageRiskScore, 2),
      maxRiskScore,
      maxRain24h: round(maxRain24h, 2),
      maxRain1h: round(maxRain1h, 2),
      maxWindSpeed: round(maxWindSpeed, 2),
      maxTemperature: round(maxTemperature, 2),
      locationRiskMultiplier: round(locationRiskMultiplier, 4),
      seasonMultiplier: round(seasonMultiplier, 4),
      expectedRevenuePerHaEur: round(expectedRevenuePerHaEur, 2),
      insuredAmountPerHaEur: round(insuredAmountPerHaEur, 2),
      payoutCapEur: round(payoutCapEur, 2),
      premiumRate: round(premiumRate, 4),
      premiumAmountEur: round(premiumAmountEur, 2),
      breakdown: {
        crop: {
          cropType: crop.cropType,
          displayName: crop.displayName,
          expectedYieldTHa: crop.expectedYieldTHa,
          referencePriceEurT: crop.referencePriceEurT,
          productionCostEurHa: crop.productionCostEurHa,
          basePremiumRate: crop.basePremiumRate,
        },
        coverage: {
          areaHa: round(input.areaHa, 4),
          coverageDays,
          referenceSeasonDays: crop.referenceSeasonDays,
        },
        risk: {
          source: historyMetrics.source,
          sampleCount: historyMetrics.sampleCount,
          warning: historyMetrics.warning ?? null,
          riskTier,
          severeEvents90d,
          averageRiskScore: round(averageRiskScore, 2),
          maxRiskScore,
          maxRain24h: round(maxRain24h, 2),
          maxRain1h: round(maxRain1h, 2),
          maxWindSpeed: round(maxWindSpeed, 2),
          maxTemperature: round(maxTemperature, 2),
          locationRiskMultiplier: round(locationRiskMultiplier, 4),
        },
        pricing: {
          expectedRevenuePerHaEur: round(expectedRevenuePerHaEur, 2),
          expectedMarginPerHaEur: round(expectedMarginPerHaEur, 2),
          insuredAmountPerHaEur: round(insuredAmountPerHaEur, 2),
          payoutCapEur: round(payoutCapEur, 2),
          seasonMultiplier: round(seasonMultiplier, 4),
          opsFeeRate: OPS_FEE_RATE,
          premiumRate: round(premiumRate, 4),
          premiumAmountEur: round(premiumAmountEur, 2),
        },
      },
    };
  }

  private async resolveHistoryMetrics(locationId: string): Promise<HistoryMetrics> {
    const snapshots = await this.riskSnapshotRepository.listHistory(locationId, HISTORY_LIMIT);
    if (snapshots.length >= env.underwritingLocalHistoryMinPoints) {
      return {
        sampleCount: snapshots.length,
        severeEvents90d: snapshots.filter(
          (snapshot) =>
            snapshot.riskScore >= SEVERE_TRIGGER_SCORE ||
            snapshot.rain24h > SEVERE_TRIGGER_RAIN_24H
        ).length,
        averageRiskScore: average(snapshots.map((snapshot) => snapshot.riskScore)),
        maxRiskScore: maxOrZero(snapshots.map((snapshot) => snapshot.riskScore)),
        maxRain24h: maxOrZero(snapshots.map((snapshot) => snapshot.rain24h)),
        maxRain1h: maxOrZero(snapshots.map((snapshot) => snapshot.rain1h)),
        maxWindSpeed: maxOrZero(snapshots.map((snapshot) => snapshot.windSpeed)),
        maxTemperature: maxOrZero(snapshots.map((snapshot) => snapshot.temperature)),
        source: "local",
      };
    }

    const location = await this.locationRepository.getById(locationId);
    if (!location) {
      return this.buildFallbackHistoryMetrics(
        `Location ${locationId} is missing, underwriting used a conservative fallback.`
      );
    }

    try {
      return await this.historicalUnderwritingService.buildMetrics({
        locationId,
        latitude: location.latitude,
        longitude: location.longitude,
        historyDays: env.underwritingHistoryDays,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.buildFallbackHistoryMetrics(
        `Open-Meteo history unavailable for ${locationId}, conservative fallback applied. ${message}`
      );
    }
  }

  private buildFallbackHistoryMetrics(warning: string): HistoryMetrics {
    return {
      sampleCount: 0,
      severeEvents90d: 1,
      averageRiskScore: 6,
      maxRiskScore: 7,
      maxRain24h: 50,
      maxRain1h: 15,
      maxWindSpeed: 15,
      maxTemperature: 35,
      source: "fallback",
      warning,
    };
  }
}
