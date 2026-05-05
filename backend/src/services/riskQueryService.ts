import { RiskEventRepository } from "../repositories/riskEventRepository";
import { RiskSnapshotRepository } from "../repositories/riskSnapshotRepository";
import { WeatherRepository } from "../repositories/weatherRepository";
import { buildRiskAssessment } from "../risk/riskEngine";
import {
  RiskSnapshot,
  RiskSnapshotDto,
  toRiskSnapshotDto,
} from "../types/riskSnapshot";

const toMetrics = (snapshot: RiskSnapshot) => ({
  locationId: snapshot.locationId,
  timestamp: snapshot.observedAt,
  rain1h: snapshot.rain1h,
  rain24h: snapshot.rain24h,
  rain72h: snapshot.rain72h,
  windSpeed: snapshot.windSpeed,
  temperature: snapshot.temperature,
  humidity: snapshot.humidity,
  weatherType: snapshot.weatherType,
  consecutiveHeavyRainHours: snapshot.consecutiveHeavyRainHours,
  eventDurationHours: snapshot.eventDurationHours,
});

export class RiskQueryService {
  constructor(
    private readonly riskSnapshotRepository = new RiskSnapshotRepository(),
    private readonly weatherRepository = new WeatherRepository(),
    private readonly riskEventRepository = new RiskEventRepository()
  ) {}

  async getLocationSummary(locationId: string) {
    const latestSnapshot = await this.riskSnapshotRepository.getLatest(locationId);
    if (!latestSnapshot) {
      return null;
    }

    const [latestWeather, openEvent, latestEvent] = await Promise.all([
      this.weatherRepository.getLatest(locationId),
      this.riskEventRepository.getOpenEvent(locationId),
      this.riskEventRepository.getLatestEvent(locationId),
    ]);

    return {
      locationId,
      latestSnapshot: toRiskSnapshotDto(latestSnapshot),
      latestWeather,
      latestEvent: openEvent ?? latestEvent,
      assessment: buildRiskAssessment(toMetrics(latestSnapshot)),
    };
  }

  async listLatestSnapshots(locationIds: string[]) {
    const snapshots = await this.riskSnapshotRepository.listLatestByLocations(locationIds);
    return snapshots.map(toRiskSnapshotDto);
  }

  async listHistory(locationId: string, limit: number) {
    const snapshots = await this.riskSnapshotRepository.listHistory(locationId, limit);
    return snapshots.map(toRiskSnapshotDto);
  }

  async listSnapshotsAfter(locationIds: string[], afterId: number, limit = 100) {
    return this.riskSnapshotRepository.listAfterId(locationIds, afterId, limit);
  }
}
