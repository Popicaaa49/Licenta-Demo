export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export enum PolicyState {
  Active = 0,
  PaidOut = 1,
  Expired = 2,
  Cancelled = 3,
}

export interface Policy {
  id: number;
  user: string;
  locationId: string;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cropType: string;
  thresholdScore: number;
  emergencyRain24h: number;
  payoutWei: bigint;
  payoutEth: string;
  startTime: number;
  endTime: number;
  lastOracleUpdateAt: number;
  lastRiskScore: number;
  payoutTriggered: boolean;
  state: PolicyState;
}

export interface WeatherReportSnapshot {
  observedAt: number;
  rain1h: number;
  rain24h: number;
  rain72h: number;
  consecutiveHeavyRainHours: number;
  eventDurationHours: number;
  windSpeed: number;
  temperature: number;
  humidity: number;
  weatherCondition: string;
  riskScore: number;
}

export interface RiskSnapshot {
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
}

export interface PolicyLocationMetadata {
  id: number;
  locationId: string;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface InsuredLocation {
  locationId: string;
  locationLabel: string;
  sourceType: string;
  latitude: number;
  longitude: number;
  areaHectares: number | null;
  geometryGeoJson: unknown | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CropReference {
  cropType: string;
  displayName: string;
  family: string;
  expectedYieldTHa: number;
  referencePriceEurT: number;
  productionCostEurHa: number;
  basePremiumRate: number;
  referenceSeasonDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceQuote {
  id: number;
  requestId: number;
  underwriterAddress: string;
  status: string;
  lockedAmountEth: number | null;
  capitalLockTxHash: string | null;
  riskTier: string;
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
  livePricing?: {
    ethEurRate: number;
    capitalLockEth: number;
    capitalLockWei: string;
    premiumLockEth: number;
    premiumLockWei: string;
    rateSource: string;
    fetchedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PremiumPayment {
  id: number;
  requestId: number;
  quoteId: number;
  payerAddress: string;
  amountEur: number;
  amountEth: number | null;
  asset: string;
  transactionHash: string | null;
  status: string;
  createdAt: string;
}

export interface CapitalReservation {
  id: number;
  requestId: number;
  quoteId: number;
  policyId: number | null;
  reservedAmountEur: number;
  reservedAmountEth: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceRequest {
  id: number;
  farmerAddress: string;
  locationId: string;
  locationLabel: string;
  cropType: string;
  areaHa: number;
  coverageStart: string;
  coverageEnd: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  latestQuote: InsuranceQuote | null;
  latestPremiumPayment: PremiumPayment | null;
  latestReservation: CapitalReservation | null;
}

export const POLICY_STATE_LABELS: Record<PolicyState, string> = {
  [PolicyState.Active]: "Activa",
  [PolicyState.PaidOut]: "Despagubita",
  [PolicyState.Expired]: "Expirata",
  [PolicyState.Cancelled]: "Anulata",
};
