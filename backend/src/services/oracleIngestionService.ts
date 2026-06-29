import { ContractRepository } from "../repositories/contractRepository";
import { NotificationRepository } from "../repositories/notificationRepository";
import { RiskSnapshotRepository } from "../repositories/riskSnapshotRepository";
import { RiskEventRepository } from "../repositories/riskEventRepository";
import { WeatherRepository } from "../repositories/weatherRepository";
import { buildRiskAssessment } from "../risk/riskEngine";
import { WeatherMetrics } from "../risk/types";
import { RiskStreamBroker } from "./riskStreamBroker";
import { PayoutOrchestrator } from "./payoutOrchestrator";

export type OracleUpdatePayload = {
  locationId: string;
  timestamp: string;
  rain1h: number;
  rain24h?: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherType: string;
  source?: string;
  rawPayload?: unknown;
};

const HEAVY_RAIN_THRESHOLD = 20;
const SEVERE_WEATHER_NOTIFICATION_SCORE = 5;

const toNumber = (value: string | number | null | undefined) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
};

const roundMetric = (value: number) => Number(value.toFixed(2));

const sumRain = (
  rain1h: number,
  recentRows: Array<{ rain_1h: string }>,
  hours: number
) =>
  roundMetric(
    rain1h +
      recentRows
        .slice(0, Math.max(0, hours - 1))
        .reduce((sum, row) => sum + toNumber(row.rain_1h), 0)
  );

const calculateConsecutiveHeavyRainHours = (
  rain1h: number,
  recentRows: Array<{ rain_1h: string }>
) => {
  if (rain1h <= HEAVY_RAIN_THRESHOLD) return 0;

  let hours = 1;
  for (const row of recentRows) {
    if (toNumber(row.rain_1h) > HEAVY_RAIN_THRESHOLD) {
      hours += 1;
      continue;
    }

    break;
  }

  return hours;
};

const calculateEventDurationHours = (startTime: Date, observedAt: Date) =>
  Math.max(1, Math.floor((observedAt.getTime() - startTime.getTime()) / 3_600_000) + 1);

type OracleIngestionServiceDeps = {
  weatherRepository?: WeatherRepository;
  riskEventRepository?: RiskEventRepository;
  contractRepository?: ContractRepository;
  riskSnapshotRepository?: RiskSnapshotRepository;
  notificationRepository?: NotificationRepository;
  payoutOrchestrator?: PayoutOrchestrator;
  riskStreamBroker?: RiskStreamBroker;
};

export class OracleIngestionService {
  private readonly weatherRepository: WeatherRepository;
  private readonly riskEventRepository: RiskEventRepository;
  private readonly contractRepository: ContractRepository;
  private readonly riskSnapshotRepository: RiskSnapshotRepository;
  private readonly notificationRepository: NotificationRepository;
  private readonly payoutOrchestrator: PayoutOrchestrator;
  private readonly riskStreamBroker?: RiskStreamBroker;

  constructor(deps: OracleIngestionServiceDeps = {}) {
    this.weatherRepository = deps.weatherRepository ?? new WeatherRepository();
    this.riskEventRepository = deps.riskEventRepository ?? new RiskEventRepository();
    this.contractRepository = deps.contractRepository ?? new ContractRepository();
    this.riskSnapshotRepository = deps.riskSnapshotRepository ?? new RiskSnapshotRepository();
    this.notificationRepository = deps.notificationRepository ?? new NotificationRepository();
    this.payoutOrchestrator = deps.payoutOrchestrator ?? new PayoutOrchestrator();
    this.riskStreamBroker = deps.riskStreamBroker;
  }

  async processUpdate(payload: OracleUpdatePayload) {
    const observedAt = new Date(payload.timestamp);
    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("timestamp must be a valid ISO date.");
    }

    const recentRows = await this.weatherRepository.listRecent(payload.locationId, 72, observedAt);
    const rain24h = roundMetric(payload.rain24h ?? sumRain(payload.rain1h, recentRows, 24));
    const rain72h = sumRain(payload.rain1h, recentRows, 72);
    const consecutiveHeavyRainHours = calculateConsecutiveHeavyRainHours(
      payload.rain1h,
      recentRows
    );

    const openEvent = await this.riskEventRepository.getOpenEvent(payload.locationId);

    const provisionalMetrics: WeatherMetrics = {
      locationId: payload.locationId,
      timestamp: observedAt,
      rain1h: roundMetric(payload.rain1h),
      rain24h,
      rain72h,
      windSpeed: roundMetric(payload.windSpeed),
      temperature: roundMetric(payload.temperature),
      humidity: roundMetric(payload.humidity),
      weatherType: payload.weatherType,
      consecutiveHeavyRainHours,
      eventDurationHours: 0,
    };

    const provisionalAssessment = buildRiskAssessment(provisionalMetrics);
    const eventStartTime =
      provisionalAssessment.eventActive && openEvent ? openEvent.start_time : observedAt;

    const finalMetrics: WeatherMetrics = {
      ...provisionalMetrics,
      eventDurationHours: provisionalAssessment.eventActive
        ? calculateEventDurationHours(eventStartTime, observedAt)
        : 0,
    };
    const assessment = buildRiskAssessment(finalMetrics);

    const weatherRecord = await this.weatherRepository.insert({
      locationId: payload.locationId,
      timestamp: observedAt,
      rain1h: finalMetrics.rain1h,
      rain24h: finalMetrics.rain24h,
      windSpeed: finalMetrics.windSpeed,
      temperature: finalMetrics.temperature,
      humidity: finalMetrics.humidity,
      weatherType: finalMetrics.weatherType,
      source: payload.source,
      rawPayload: payload.rawPayload ?? payload,
    });

    const riskSnapshot = await this.riskSnapshotRepository.save({
      weatherDataId: weatherRecord.id,
      locationId: payload.locationId,
      observedAt,
      season: assessment.season,
      riskScore: assessment.riskScore,
      eventActive: assessment.eventActive,
      rain1h: finalMetrics.rain1h,
      rain24h: finalMetrics.rain24h,
      rain72h: finalMetrics.rain72h,
      consecutiveHeavyRainHours,
      eventDurationHours: finalMetrics.eventDurationHours,
      windSpeed: finalMetrics.windSpeed,
      temperature: finalMetrics.temperature,
      humidity: finalMetrics.humidity,
      weatherType: finalMetrics.weatherType,
      matchedRules: assessment.matchedRules,
      explanation: assessment.explanation,
      calculationVersion: assessment.calculationVersion,
    });

    this.riskStreamBroker?.publish(riskSnapshot);

    let riskEventId: string | null = null;
    if (assessment.eventActive) {
      const savedEvent = await this.riskEventRepository.save({
        id: openEvent?.id,
        locationId: payload.locationId,
        startTime: openEvent?.start_time ?? observedAt,
        endTime: assessment.payoutTriggered ? observedAt : null,
        riskScore: assessment.riskScore,
        payoutTriggered: assessment.payoutTriggered,
        rain72h,
        consecutiveHeavyRainHours,
        season: assessment.season,
        triggerReasons: assessment.matchedRules,
      });
      riskEventId = savedEvent?.id ?? openEvent?.id ?? null;
    } else if (openEvent) {
      await this.riskEventRepository.save({
        id: openEvent.id,
        locationId: payload.locationId,
        startTime: openEvent.start_time,
        endTime: observedAt,
        riskScore: assessment.riskScore,
        payoutTriggered: false,
        rain72h,
        consecutiveHeavyRainHours,
        season: assessment.season,
        triggerReasons: assessment.matchedRules,
      });
    }

    const activeContracts = await this.contractRepository.getActiveByLocation(
      payload.locationId,
      observedAt
    );

    if (
      assessment.eventActive &&
      assessment.riskScore >= SEVERE_WEATHER_NOTIFICATION_SCORE &&
      activeContracts.length > 0
    ) {
      await this.notifySevereWeather(activeContracts, riskSnapshot, riskEventId);
    }

    const payoutJobs = await this.payoutOrchestrator.enqueueTriggeredPolicies({
      locationId: payload.locationId,
      snapshot: riskSnapshot,
      activePolicies: activeContracts,
    });

    return {
      weatherRecord,
      riskSnapshot,
      assessment,
      payoutJobs,
    };
  }

  async getRiskSummary(locationId: string) {
    const latestWeather = await this.weatherRepository.getLatest(locationId);
    const latestSnapshot = await this.riskSnapshotRepository.getLatest(locationId);
    if (!latestWeather || !latestSnapshot) {
      return null;
    }

    const assessment = buildRiskAssessment({
      locationId,
      timestamp: latestSnapshot.observedAt,
      rain1h: latestSnapshot.rain1h,
      rain24h: latestSnapshot.rain24h,
      rain72h: latestSnapshot.rain72h,
      windSpeed: latestSnapshot.windSpeed,
      temperature: latestSnapshot.temperature,
      humidity: latestSnapshot.humidity,
      weatherType: latestSnapshot.weatherType,
      consecutiveHeavyRainHours: latestSnapshot.consecutiveHeavyRainHours,
      eventDurationHours: latestSnapshot.eventDurationHours,
    });
    const openEvent = await this.riskEventRepository.getOpenEvent(locationId);
    const latestEvent = openEvent ?? (await this.riskEventRepository.getLatestEvent(locationId));

    return {
      locationId,
      latestWeather,
      latestSnapshot,
      assessment,
      latestEvent,
    };
  }

  private async notifySevereWeather(
    activeContracts: Awaited<ReturnType<ContractRepository["getActiveByLocation"]>>,
    riskSnapshot: Awaited<ReturnType<RiskSnapshotRepository["save"]>>,
    riskEventId: string | null
  ) {
    const eventKey = riskEventId ?? `snapshot:${riskSnapshot.id}`;
    const notifications = activeContracts.flatMap((contract) => {
      const recipients = [contract.user_address, contract.underwriter_address].filter(
        (recipient): recipient is string => Boolean(recipient)
      );

      return recipients.map((recipientAddress) => ({
        recipientAddress,
        type: "severe_weather_detected",
        title: "Eveniment meteo sever detectat",
        message: `Locatia politei #${contract.id} are risk score ${riskSnapshot.riskScore}. Sistemul monitorizeaza conditiile parametrice.`,
        entityType: "policy",
        entityId: Number(contract.id),
        dedupeKey: `severe_weather:${contract.id}:${eventKey}`,
        metadata: {
          policyId: Number(contract.id),
          locationId: riskSnapshot.locationId,
          riskSnapshotId: riskSnapshot.id,
          riskEventId,
          riskScore: riskSnapshot.riskScore,
          rain24h: riskSnapshot.rain24h,
          windSpeed: riskSnapshot.windSpeed,
          temperature: riskSnapshot.temperature,
          matchedRules: riskSnapshot.matchedRules,
        },
      }));
    });

    try {
      await this.notificationRepository.createMany(notifications);
    } catch (error) {
      console.warn("Unable to create severe weather notification", error);
    }
  }
}
