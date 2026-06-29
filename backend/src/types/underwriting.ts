export type CropReferenceRecord = {
  crop_type: string;
  display_name: string;
  family: string;
  expected_yield_t_ha: string;
  reference_price_eur_t: string;
  production_cost_eur_ha: string;
  base_premium_rate: string;
  reference_season_days: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type CropReference = {
  cropType: string;
  displayName: string;
  family: string;
  expectedYieldTHa: number;
  referencePriceEurT: number;
  productionCostEurHa: number;
  basePremiumRate: number;
  referenceSeasonDays: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type InsuranceRequestRecord = {
  id: string;
  farmer_address: string;
  location_id: string;
  location_label: string;
  crop_type: string;
  area_ha: string;
  coverage_start: Date;
  coverage_end: Date;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type InsuranceQuoteRecord = {
  id: string;
  request_id: string;
  underwriter_address: string;
  status: string;
  locked_amount_eth: string | null;
  capital_lock_tx_hash: string | null;
  risk_tier: string;
  severe_events_90d: number;
  average_risk_score: string;
  max_risk_score: number;
  max_rain_24h: string;
  max_rain_1h: string;
  max_wind_speed: string;
  max_temperature: string;
  location_risk_multiplier: string;
  season_multiplier: string;
  expected_revenue_per_ha_eur: string;
  insured_amount_per_ha_eur: string;
  payout_cap_eur: string;
  premium_rate: string;
  premium_amount_eur: string;
  trigger_threshold_score: number;
  trigger_emergency_rain_24h: number;
  risk_model_version: string;
  expires_at: Date;
  breakdown: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type QuoteSettlementRecord = {
  id: string;
  quote_id: string;
  status: string;
  underwriter_address: string | null;
  premium_lock_wei: string;
  payout_cap_wei: string;
  eth_eur_rate: string;
  rate_source: string;
  rate_fetched_at: Date;
  expires_at: Date;
  terms_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
};

export type InsuranceRequestWithQuoteRecord = InsuranceRequestRecord & {
  quote_id: string | null;
  quote_status: string | null;
  locked_amount_eth: string | null;
  capital_lock_tx_hash: string | null;
  risk_tier: string | null;
  severe_events_90d: number | null;
  average_risk_score: string | null;
  max_risk_score: number | null;
  max_rain_24h: string | null;
  max_rain_1h: string | null;
  max_wind_speed: string | null;
  max_temperature: string | null;
  location_risk_multiplier: string | null;
  season_multiplier: string | null;
  expected_revenue_per_ha_eur: string | null;
  insured_amount_per_ha_eur: string | null;
  payout_cap_eur: string | null;
  premium_rate: string | null;
  premium_amount_eur: string | null;
  trigger_threshold_score: number | null;
  trigger_emergency_rain_24h: number | null;
  risk_model_version: string | null;
  expires_at: Date | null;
  breakdown: Record<string, unknown> | null;
  quote_created_at: Date | null;
  quote_updated_at: Date | null;
  underwriter_address: string | null;
  settlement_id: string | null;
  settlement_status: string | null;
  settlement_underwriter_address: string | null;
  settlement_premium_lock_wei: string | null;
  settlement_payout_cap_wei: string | null;
  settlement_eth_eur_rate: string | null;
  settlement_rate_source: string | null;
  settlement_rate_fetched_at: Date | null;
  settlement_expires_at: Date | null;
  settlement_terms_tx_hash: string | null;
  settlement_created_at: Date | null;
  settlement_updated_at: Date | null;
  payment_id: string | null;
  payment_settlement_id: string | null;
  payment_status: string | null;
  payment_payer_address: string | null;
  payment_amount_eur: string | null;
  payment_amount_eth: string | null;
  payment_asset: string | null;
  payment_transaction_hash: string | null;
  payment_created_at: Date | null;
  reservation_id: string | null;
  reservation_settlement_id: string | null;
  reservation_status: string | null;
  reservation_policy_id: string | null;
  reserved_amount_eur: string | null;
  reserved_amount_eth: string | null;
  reservation_created_at: Date | null;
  reservation_updated_at: Date | null;
};

export type PremiumPaymentRecord = {
  id: string;
  request_id: string;
  quote_id: string;
  settlement_id: string | null;
  payer_address: string;
  amount_eur: string;
  amount_eth: string | null;
  asset: string;
  transaction_hash: string | null;
  status: string;
  created_at: Date;
};

export type CapitalReservationRecord = {
  id: string;
  request_id: string;
  quote_id: string;
  settlement_id: string | null;
  policy_id: string | null;
  reserved_amount_eur: string;
  reserved_amount_eth: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type InsuranceQuote = {
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
  triggerThresholdScore: number;
  triggerEmergencyRain24h: number;
  riskModelVersion: string;
  expiresAt: Date;
  breakdown: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type InsuranceRequest = {
  id: number;
  farmerAddress: string;
  locationId: string;
  locationLabel: string;
  cropType: string;
  areaHa: number;
  coverageStart: Date;
  coverageEnd: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type InsuranceRequestDetails = InsuranceRequest & {
  latestQuote: InsuranceQuote | null;
  latestSettlement: QuoteSettlement | null;
  latestPremiumPayment: PremiumPayment | null;
  latestReservation: CapitalReservation | null;
};

export type QuoteSettlement = {
  id: number;
  quoteId: number;
  status: string;
  underwriterAddress: string | null;
  premiumLockWei: string;
  payoutCapWei: string;
  ethEurRate: number;
  rateSource: string;
  rateFetchedAt: Date;
  expiresAt: Date;
  termsTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PremiumPayment = {
  id: number;
  requestId: number;
  quoteId: number;
  settlementId: number | null;
  payerAddress: string;
  amountEur: number;
  amountEth: number | null;
  asset: string;
  transactionHash: string | null;
  status: string;
  createdAt: Date;
};

export type CapitalReservation = {
  id: number;
  requestId: number;
  quoteId: number;
  settlementId: number | null;
  policyId: number | null;
  reservedAmountEur: number;
  reservedAmountEth: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
};

export const mapCropReferenceRecord = (record: CropReferenceRecord): CropReference => ({
  cropType: record.crop_type,
  displayName: record.display_name,
  family: record.family,
  expectedYieldTHa: Number(record.expected_yield_t_ha),
  referencePriceEurT: Number(record.reference_price_eur_t),
  productionCostEurHa: Number(record.production_cost_eur_ha),
  basePremiumRate: Number(record.base_premium_rate),
  referenceSeasonDays: record.reference_season_days,
  active: record.active,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const mapInsuranceRequestRecord = (record: InsuranceRequestRecord): InsuranceRequest => ({
  id: Number(record.id),
  farmerAddress: record.farmer_address,
  locationId: record.location_id,
  locationLabel: record.location_label,
  cropType: record.crop_type,
  areaHa: Number(record.area_ha),
  coverageStart: record.coverage_start,
  coverageEnd: record.coverage_end,
  status: record.status,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const mapInsuranceQuoteRecord = (record: InsuranceQuoteRecord): InsuranceQuote => ({
  id: Number(record.id),
  requestId: Number(record.request_id),
  underwriterAddress: record.underwriter_address,
  status: record.status,
  lockedAmountEth: toNumber(record.locked_amount_eth),
  capitalLockTxHash: record.capital_lock_tx_hash,
  riskTier: record.risk_tier,
  severeEvents90d: record.severe_events_90d,
  averageRiskScore: Number(record.average_risk_score),
  maxRiskScore: record.max_risk_score,
  maxRain24h: Number(record.max_rain_24h),
  maxRain1h: Number(record.max_rain_1h),
  maxWindSpeed: Number(record.max_wind_speed),
  maxTemperature: Number(record.max_temperature),
  locationRiskMultiplier: Number(record.location_risk_multiplier),
  seasonMultiplier: Number(record.season_multiplier),
  expectedRevenuePerHaEur: Number(record.expected_revenue_per_ha_eur),
  insuredAmountPerHaEur: Number(record.insured_amount_per_ha_eur),
  payoutCapEur: Number(record.payout_cap_eur),
  premiumRate: Number(record.premium_rate),
  premiumAmountEur: Number(record.premium_amount_eur),
  triggerThresholdScore: record.trigger_threshold_score,
  triggerEmergencyRain24h: record.trigger_emergency_rain_24h,
  riskModelVersion: record.risk_model_version,
  expiresAt: record.expires_at,
  breakdown: record.breakdown ?? {},
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const mapQuoteSettlementRecord = (record: QuoteSettlementRecord): QuoteSettlement => ({
  id: Number(record.id),
  quoteId: Number(record.quote_id),
  status: record.status,
  underwriterAddress: record.underwriter_address,
  premiumLockWei: String(record.premium_lock_wei),
  payoutCapWei: String(record.payout_cap_wei),
  ethEurRate: Number(record.eth_eur_rate),
  rateSource: record.rate_source,
  rateFetchedAt: record.rate_fetched_at,
  expiresAt: record.expires_at,
  termsTxHash: record.terms_tx_hash,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const mapPremiumPaymentRecord = (record: PremiumPaymentRecord): PremiumPayment => ({
  id: Number(record.id),
  requestId: Number(record.request_id),
  quoteId: Number(record.quote_id),
  settlementId: record.settlement_id === null ? null : Number(record.settlement_id),
  payerAddress: record.payer_address,
  amountEur: Number(record.amount_eur),
  amountEth: toNumber(record.amount_eth),
  asset: record.asset,
  transactionHash: record.transaction_hash,
  status: record.status,
  createdAt: record.created_at,
});

export const mapCapitalReservationRecord = (
  record: CapitalReservationRecord
): CapitalReservation => ({
  id: Number(record.id),
  requestId: Number(record.request_id),
  quoteId: Number(record.quote_id),
  settlementId: record.settlement_id === null ? null : Number(record.settlement_id),
  policyId: record.policy_id === null ? null : Number(record.policy_id),
  reservedAmountEur: Number(record.reserved_amount_eur),
  reservedAmountEth: toNumber(record.reserved_amount_eth),
  status: record.status,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const mapInsuranceRequestWithQuoteRecord = (
  record: InsuranceRequestWithQuoteRecord
): InsuranceRequestDetails => ({
  ...mapInsuranceRequestRecord(record),
  latestQuote:
    record.quote_id === null
      ? null
      : {
          id: Number(record.quote_id),
          requestId: Number(record.id),
          underwriterAddress: record.underwriter_address ?? "system",
          status: record.quote_status ?? "open",
          lockedAmountEth: toNumber(record.locked_amount_eth),
          capitalLockTxHash: record.capital_lock_tx_hash ?? null,
          riskTier: record.risk_tier ?? "unknown",
          severeEvents90d: record.severe_events_90d ?? 0,
          averageRiskScore: toNumber(record.average_risk_score) ?? 0,
          maxRiskScore: record.max_risk_score ?? 0,
          maxRain24h: toNumber(record.max_rain_24h) ?? 0,
          maxRain1h: toNumber(record.max_rain_1h) ?? 0,
          maxWindSpeed: toNumber(record.max_wind_speed) ?? 0,
          maxTemperature: toNumber(record.max_temperature) ?? 0,
          locationRiskMultiplier: toNumber(record.location_risk_multiplier) ?? 1,
          seasonMultiplier: toNumber(record.season_multiplier) ?? 1,
          expectedRevenuePerHaEur: toNumber(record.expected_revenue_per_ha_eur) ?? 0,
          insuredAmountPerHaEur: toNumber(record.insured_amount_per_ha_eur) ?? 0,
          payoutCapEur: toNumber(record.payout_cap_eur) ?? 0,
          premiumRate: toNumber(record.premium_rate) ?? 0,
          premiumAmountEur: toNumber(record.premium_amount_eur) ?? 0,
          triggerThresholdScore: record.trigger_threshold_score ?? 8,
          triggerEmergencyRain24h: record.trigger_emergency_rain_24h ?? 80,
          riskModelVersion: record.risk_model_version ?? "legacy",
          expiresAt: record.expires_at ?? record.created_at,
          breakdown: record.breakdown ?? {},
          createdAt: record.quote_created_at ?? record.created_at,
          updatedAt: record.quote_updated_at ?? record.updated_at,
        },
  latestSettlement:
    record.settlement_id === null
      ? null
      : {
          id: Number(record.settlement_id),
          quoteId: Number(record.quote_id ?? 0),
          status: record.settlement_status ?? "unknown",
          underwriterAddress: record.settlement_underwriter_address ?? null,
          premiumLockWei: String(record.settlement_premium_lock_wei ?? "0"),
          payoutCapWei: String(record.settlement_payout_cap_wei ?? "0"),
          ethEurRate: toNumber(record.settlement_eth_eur_rate) ?? 0,
          rateSource: record.settlement_rate_source ?? "unknown",
          rateFetchedAt: record.settlement_rate_fetched_at ?? record.created_at,
          expiresAt: record.settlement_expires_at ?? record.created_at,
          termsTxHash: record.settlement_terms_tx_hash ?? null,
          createdAt: record.settlement_created_at ?? record.created_at,
          updatedAt: record.settlement_updated_at ?? record.created_at,
        },
  latestPremiumPayment:
    record.payment_id === null
      ? null
      : {
          id: Number(record.payment_id),
          requestId: Number(record.id),
          quoteId: Number(record.quote_id ?? 0),
          settlementId:
            record.payment_settlement_id === null ? null : Number(record.payment_settlement_id),
          payerAddress: record.payment_payer_address ?? "",
          amountEur: toNumber(record.payment_amount_eur) ?? 0,
          amountEth: toNumber(record.payment_amount_eth),
          asset: record.payment_asset ?? "EUR",
          transactionHash: record.payment_transaction_hash ?? null,
          status: record.payment_status ?? "recorded",
          createdAt: record.payment_created_at ?? record.created_at,
        },
  latestReservation:
    record.reservation_id === null
      ? null
      : {
          id: Number(record.reservation_id),
          requestId: Number(record.id),
          quoteId: Number(record.quote_id ?? 0),
          settlementId:
            record.reservation_settlement_id === null
              ? null
              : Number(record.reservation_settlement_id),
          policyId: record.reservation_policy_id === null ? null : Number(record.reservation_policy_id),
          reservedAmountEur: toNumber(record.reserved_amount_eur) ?? 0,
          reservedAmountEth: toNumber(record.reserved_amount_eth),
          status: record.reservation_status ?? "reserved",
          createdAt: record.reservation_created_at ?? record.created_at,
          updatedAt: record.reservation_updated_at ?? record.updated_at,
        },
});
