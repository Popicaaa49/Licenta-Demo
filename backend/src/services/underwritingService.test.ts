import assert from "node:assert/strict";
import test from "node:test";
import { UnderwritingService } from "./underwritingService";

const crop = {
  cropType: "wheat",
  displayName: "Grau",
  family: "cereal",
  expectedYieldTHa: 5,
  referencePriceEurT: 200,
  productionCostEurHa: 600,
  basePremiumRate: 0.05,
  referenceSeasonDays: 120,
  active: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("underwriting derives an offer from local history and crop economics", async () => {
  const cropRepository = {
    getByCropType: async () => crop,
  };
  const riskSnapshotRepository = {
    listHistory: async () =>
      Array.from({ length: 168 }, (_, index) =>
        index === 0
          ? {
              riskScore: 8,
              rain24h: 55,
              rain1h: 12,
              windSpeed: 10,
              temperature: 30,
            }
          : {
              riskScore: 0,
              rain24h: 0,
              rain1h: 0,
              windSpeed: 0,
              temperature: 20,
            }
      ),
  };
  const locationRepository = {
    getById: async () => null,
  };
  const historicalService = {
    buildMetrics: async () => {
      throw new Error("Historical provider should not be used when local history is sufficient.");
    },
  };

  const service = new UnderwritingService(
    cropRepository as never,
    riskSnapshotRepository as never,
    locationRepository as never,
    historicalService as never
  );

  const quote = await service.buildQuote({
    locationId: "RO-TM-001",
    cropType: "wheat",
    areaHa: 10,
    coverageStart: new Date("2026-04-01T00:00:00.000Z"),
    coverageEnd: new Date("2026-07-30T00:00:00.000Z"),
  });

  assert.equal(quote.riskTier, "medium");
  assert.equal(quote.locationRiskMultiplier, 1);
  assert.equal(quote.expectedRevenuePerHaEur, 1000);
  assert.equal(quote.insuredAmountPerHaEur, 610);
  assert.equal(quote.payoutCapEur, 6100);
  assert.equal(quote.premiumRate, 0.055);
  assert.equal(quote.premiumAmountEur, 335.5);
  assert.equal((quote.breakdown.risk as { source: string }).source, "local");
});
