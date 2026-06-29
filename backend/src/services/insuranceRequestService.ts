import { ethers } from "ethers";
import { InsuranceContractClient } from "../blockchain/insuranceContractClient";
import { env } from "../config/env";
import { CapitalReservationRepository } from "../repositories/capitalReservationRepository";
import { CropReferenceRepository } from "../repositories/cropReferenceRepository";
import { InsuranceQuoteRepository } from "../repositories/insuranceQuoteRepository";
import { InsuranceRequestRepository } from "../repositories/insuranceRequestRepository";
import { NotificationRepository } from "../repositories/notificationRepository";
import { PremiumPaymentRepository } from "../repositories/premiumPaymentRepository";
import { QuoteSettlementRepository } from "../repositories/quoteSettlementRepository";
import { buildPolicyTriggerConfiguration } from "../risk/riskEngine";
import { InsuranceQuote, InsuranceRequestDetails, QuoteSettlement } from "../types/underwriting";
import { ContractService } from "./contractService";
import { EthMarketDataService } from "./ethMarketDataService";
import { LocationIntakeService } from "./locationIntakeService";
import { UnderwritingService } from "./underwritingService";

export type CreateInsuranceRequestInput = {
  farmerAddress: string;
  locationId?: string;
  locationLabel?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  locationGeoJson?: unknown;
  cropType: string;
  areaHa?: number | string | null;
  coverageStart: string;
  coverageEnd: string;
};

type InsuranceRequestServiceDeps = {
  requestRepository?: InsuranceRequestRepository;
  quoteRepository?: InsuranceQuoteRepository;
  settlementRepository?: QuoteSettlementRepository;
  premiumPaymentRepository?: PremiumPaymentRepository;
  capitalReservationRepository?: CapitalReservationRepository;
  notificationRepository?: NotificationRepository;
  cropReferenceRepository?: CropReferenceRepository;
  underwritingService?: UnderwritingService;
  locationIntakeService?: LocationIntakeService;
  contractService?: ContractService;
  insuranceClient?: InsuranceContractClient;
  ethMarketDataService?: EthMarketDataService;
};

const normalizeAddress = (address?: string | null) => {
  if (!address || !ethers.isAddress(address)) {
    return null;
  }

  return address.toLowerCase();
};

const parseArea = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
};

const isLocked = (status: string | undefined | null) => status === "locked";

const settlementIsOpen = (status: string) =>
  ["prepared", "premium_locked", "ready_for_activation"].includes(status);

const PUBLIC_REQUEST_STATUSES = new Set([
  "quoted",
  "awaiting_farmer_lock",
  "awaiting_underwriter",
]);

const deriveRequestStatus = (input: {
  settlementPrepared: boolean;
  premiumLocked: boolean;
  capitalLocked: boolean;
}) => {
  if (input.premiumLocked && input.capitalLocked) {
    return "ready_for_activation";
  }

  if (input.premiumLocked) {
    return "awaiting_underwriter";
  }

  if (input.capitalLocked) {
    return "awaiting_farmer_lock";
  }

  return input.settlementPrepared ? "awaiting_farmer_lock" : "quoted";
};

export class InsuranceRequestService {
  private readonly requestRepository: InsuranceRequestRepository;
  private readonly quoteRepository: InsuranceQuoteRepository;
  private readonly settlementRepository: QuoteSettlementRepository;
  private readonly premiumPaymentRepository: PremiumPaymentRepository;
  private readonly capitalReservationRepository: CapitalReservationRepository;
  private readonly notificationRepository: NotificationRepository;
  private readonly cropReferenceRepository: CropReferenceRepository;
  private readonly underwritingService: UnderwritingService;
  private readonly locationIntakeService: LocationIntakeService;
  private readonly contractService: ContractService;
  private readonly insuranceClient: InsuranceContractClient;
  private readonly ethMarketDataService: EthMarketDataService;

  constructor(deps: InsuranceRequestServiceDeps = {}) {
    this.requestRepository = deps.requestRepository ?? new InsuranceRequestRepository();
    this.quoteRepository = deps.quoteRepository ?? new InsuranceQuoteRepository();
    this.settlementRepository = deps.settlementRepository ?? new QuoteSettlementRepository();
    this.premiumPaymentRepository =
      deps.premiumPaymentRepository ?? new PremiumPaymentRepository();
    this.capitalReservationRepository =
      deps.capitalReservationRepository ?? new CapitalReservationRepository();
    this.notificationRepository = deps.notificationRepository ?? new NotificationRepository();
    this.cropReferenceRepository =
      deps.cropReferenceRepository ?? new CropReferenceRepository();
    this.underwritingService = deps.underwritingService ?? new UnderwritingService();
    this.locationIntakeService = deps.locationIntakeService ?? new LocationIntakeService();
    this.contractService = deps.contractService ?? new ContractService();
    this.insuranceClient = deps.insuranceClient ?? new InsuranceContractClient();
    this.ethMarketDataService =
      deps.ethMarketDataService ??
      new EthMarketDataService(env.ethExchangeRatesBaseUrl, env.ethExchangeRatesCacheTtlMs);
  }

  async listCropCatalog() {
    return this.cropReferenceRepository.listActive();
  }

  async listRequests(viewerAddress?: string | null) {
    const requests = await this.requestRepository.listAllWithLatestQuote();
    const viewer = normalizeAddress(viewerAddress);

    return requests.filter((request) => this.canViewRequest(request, viewer));
  }

  async getRequest(id: number) {
    return this.requestRepository.getByIdWithLatestQuote(id);
  }

  canViewRequest(request: InsuranceRequestDetails, viewerAddress?: string | null) {
    if (PUBLIC_REQUEST_STATUSES.has(request.status)) {
      return true;
    }

    const viewer = normalizeAddress(viewerAddress);
    if (!viewer) {
      return false;
    }

    const underwriterAddress = request.latestSettlement?.underwriterAddress;
    const isFarmer = request.farmerAddress.toLowerCase() === viewer;
    const isUnderwriter =
      !!underwriterAddress &&
      ethers.isAddress(underwriterAddress) &&
      underwriterAddress.toLowerCase() === viewer;

    return isFarmer || isUnderwriter;
  }

  async createRequest(input: CreateInsuranceRequestInput) {
    if (!ethers.isAddress(input.farmerAddress)) {
      throw new Error("farmerAddress must be a valid Ethereum address.");
    }

    const cropType = input.cropType.trim().toLowerCase();
    if (!cropType) {
      throw new Error("cropType is required.");
    }

    const crop = await this.cropReferenceRepository.getByCropType(cropType);
    if (!crop || !crop.active) {
      throw new Error(`Unsupported cropType: ${cropType}`);
    }

    const coverageStart = new Date(input.coverageStart);
    const coverageEnd = new Date(input.coverageEnd);
    if (Number.isNaN(coverageStart.getTime()) || Number.isNaN(coverageEnd.getTime())) {
      throw new Error("coverageStart and coverageEnd must be valid ISO timestamps.");
    }
    if (coverageEnd <= coverageStart) {
      throw new Error("coverageEnd must be greater than coverageStart.");
    }

    const location = await this.locationIntakeService.resolveLocation(
      {
        userAddress: input.farmerAddress,
        locationId: input.locationId,
        locationLabel: input.locationLabel,
        latitude: input.latitude,
        longitude: input.longitude,
        locationGeoJson: input.locationGeoJson,
      },
      "insurance_request"
    );

    const parsedAreaHa = parseArea(input.areaHa);
    const areaHa = parsedAreaHa ?? location.areaHectares;
    if (areaHa === null || Number.isNaN(areaHa) || areaHa <= 0) {
      throw new Error("areaHa must be a positive number or derivable from the saved parcel.");
    }

    const request = await this.requestRepository.create({
      farmerAddress: input.farmerAddress,
      locationId: location.locationId,
      locationLabel: location.locationLabel,
      cropType,
      areaHa,
      coverageStart,
      coverageEnd,
      status: "quoted",
    });

    const quoteDraft = await this.underwritingService.buildQuote({
      locationId: location.locationId,
      cropType,
      areaHa,
      coverageStart,
      coverageEnd,
    });
    const triggerConfiguration = buildPolicyTriggerConfiguration({
      cropType,
      coverageStart,
      riskTier: quoteDraft.riskTier,
    });
    const expiresAt = new Date(Date.now() + env.quoteValidityDays * 24 * 60 * 60 * 1000);

    const quote = await this.quoteRepository.create({
      requestId: request.id,
      underwriterAddress: "system",
      status: "open",
      lockedAmountEth: null,
      capitalLockTxHash: null,
      riskTier: quoteDraft.riskTier,
      severeEvents90d: quoteDraft.severeEvents90d,
      averageRiskScore: quoteDraft.averageRiskScore,
      maxRiskScore: quoteDraft.maxRiskScore,
      maxRain24h: quoteDraft.maxRain24h,
      maxRain1h: quoteDraft.maxRain1h,
      maxWindSpeed: quoteDraft.maxWindSpeed,
      maxTemperature: quoteDraft.maxTemperature,
      locationRiskMultiplier: quoteDraft.locationRiskMultiplier,
      seasonMultiplier: quoteDraft.seasonMultiplier,
      expectedRevenuePerHaEur: quoteDraft.expectedRevenuePerHaEur,
      insuredAmountPerHaEur: quoteDraft.insuredAmountPerHaEur,
      payoutCapEur: quoteDraft.payoutCapEur,
      premiumRate: quoteDraft.premiumRate,
      premiumAmountEur: quoteDraft.premiumAmountEur,
      triggerThresholdScore: triggerConfiguration.thresholdScore,
      triggerEmergencyRain24h: triggerConfiguration.emergencyRain24h,
      riskModelVersion: triggerConfiguration.riskModelVersion,
      expiresAt,
      breakdown: {
        ...quoteDraft.breakdown,
        trigger: triggerConfiguration,
        commercialQuote: {
          currency: "EUR",
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    await this.notify([request.farmerAddress], {
      type: "quote_created",
      title: "Oferta EUR a fost generata",
      message: `Cererea #${request.id} pentru ${request.cropType} are o oferta de ${quote.premiumAmountEur.toFixed(2)} EUR premium si payout maxim ${quote.payoutCapEur.toFixed(2)} EUR.`,
      entityType: "insurance_request",
      entityId: request.id,
      dedupeKey: `quote_created:${quote.id}`,
      metadata: {
        quoteId: quote.id,
        premiumAmountEur: quote.premiumAmountEur,
        payoutCapEur: quote.payoutCapEur,
      },
    });

    return { request, quote, location };
  }

  async prepareSettlement(input: { requestId: number }) {
    const request = await this.requireRequest(input.requestId);
    const quote = this.requireQuote(request);
    await this.ensureCommercialQuoteUsable(request, quote);

    if (request.latestSettlement?.status === "prepared") {
      if (request.latestSettlement.expiresAt.getTime() > Date.now()) {
        throw new Error("An active settlement session already exists for this quote.");
      }

      await this.settlementRepository.updateStatus({
        id: request.latestSettlement.id,
        status: "expired",
      });
    } else if (
      request.latestSettlement &&
      settlementIsOpen(request.latestSettlement.status)
    ) {
      throw new Error(
        "Settlement already has locked funds. Release the current locks before preparing a new settlement."
      );
    }

    const settlementTerms = await this.ethMarketDataService.getQuoteSettlementTerms({
      payoutCapEur: quote.payoutCapEur,
      premiumAmountEur: quote.premiumAmountEur,
    });
    const expiresAt = new Date(
      Date.now() + env.settlementValidityMinutes * 60 * 1000
    );
    const settlement = await this.settlementRepository.create({
      quoteId: quote.id,
      status: "prepared",
      premiumLockWei: settlementTerms.premiumLockWei,
      payoutCapWei: settlementTerms.capitalLockWei,
      ethEurRate: settlementTerms.ethEurRate,
      rateSource: settlementTerms.rateSource,
      rateFetchedAt: new Date(settlementTerms.fetchedAt),
      expiresAt,
    });

    try {
      const registration = await this.insuranceClient.registerQuote({
        quoteId: settlement.id,
        farmerAddress: request.farmerAddress,
        locationId: request.locationId,
        cropType: request.cropType,
        thresholdScore: quote.triggerThresholdScore,
        emergencyRain24h: quote.triggerEmergencyRain24h,
        premiumAmountWei: BigInt(settlement.premiumLockWei),
        payoutAmountWei: BigInt(settlement.payoutCapWei),
        startTime: request.coverageStart,
        endTime: request.coverageEnd,
        expiresAt: settlement.expiresAt,
      });
      await this.settlementRepository.updateTermsRegistration(settlement.id, registration.txHash);
    } catch (error) {
      await this.settlementRepository.updateStatus({
        id: settlement.id,
        status: "registration_failed",
      });
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Settlement terms could not be registered on-chain. ${message}`);
    }

    await this.requestRepository.updateStatus(request.id, "awaiting_farmer_lock");
    await this.notify([request.farmerAddress], {
      type: "settlement_prepared",
      title: "Settlement ETH pregatit",
      message: `Cererea #${request.id} are settlement ETH pregatit. Fermierul trebuie sa blocheze premium-ul.`,
      entityType: "insurance_request",
      entityId: request.id,
      dedupeKey: `settlement_prepared:${settlement.id}`,
      metadata: {
        quoteId: quote.id,
        settlementId: settlement.id,
        premiumLockWei: settlement.premiumLockWei,
        payoutCapWei: settlement.payoutCapWei,
        ethEurRate: settlement.ethEurRate,
        expiresAt: settlement.expiresAt.toISOString(),
      },
    });
    return this.requestRepository.getByIdWithLatestQuote(request.id);
  }

  async lockPremiumPayment(input: {
    requestId: number;
    payerAddress: string;
    transactionHash?: string | null;
    asset?: string;
  }) {
    if (!ethers.isAddress(input.payerAddress)) {
      throw new Error("payerAddress must be a valid Ethereum address.");
    }

    const request = await this.requireRequest(input.requestId);
    const quote = this.requireQuote(request);
    const settlement = this.requireSettlement(request);
    await this.ensureCommercialQuoteUsable(request, quote);
    await this.ensureSettlementUsable(request, settlement);

    if (request.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("Only the farmer attached to the request can lock the premium.");
    }

    const premiumLock = await this.insuranceClient.getPremiumLock(settlement.id);
    if (premiumLock.state !== 1) {
      throw new Error("Premium is not locked on-chain.");
    }
    if (premiumLock.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("The on-chain premium lock belongs to another farmer.");
    }
    if (premiumLock.amountWei !== BigInt(settlement.premiumLockWei)) {
      throw new Error("The locked on-chain premium does not match the settlement terms.");
    }

    const payment = await this.premiumPaymentRepository.create({
      requestId: request.id,
      quoteId: quote.id,
      settlementId: settlement.id,
      payerAddress: input.payerAddress,
      amountEur: quote.premiumAmountEur,
      amountEth: premiumLock.amountEth,
      asset: input.asset ?? "ETH_ESCROW",
      transactionHash: input.transactionHash ?? null,
      status: "locked",
    });

    await this.settlementRepository.updateStatus({ id: settlement.id, status: "premium_locked" });
    await this.requestRepository.updateStatus(
      request.id,
      deriveRequestStatus({
        settlementPrepared: true,
        premiumLocked: true,
        capitalLocked: isLocked(request.latestReservation?.status),
      })
    );

    await this.notify([request.farmerAddress], {
      type: "premium_locked",
      title: "Premium blocat",
      message: `Premium-ul pentru cererea #${request.id} a fost blocat. Cererea poate fi preluata de un underwriter.`,
      entityType: "insurance_request",
      entityId: request.id,
      dedupeKey: `premium_locked:${settlement.id}`,
      metadata: {
        quoteId: quote.id,
        settlementId: settlement.id,
        amountEth: premiumLock.amountEth,
        transactionHash: input.transactionHash ?? null,
      },
    });

    return {
      payment,
      request: await this.requestRepository.getByIdWithLatestQuote(request.id),
    };
  }

  async lockLatestQuoteCapital(input: {
    requestId: number;
    underwriterAddress: string;
    transactionHash?: string | null;
  }) {
    if (!ethers.isAddress(input.underwriterAddress)) {
      throw new Error("underwriterAddress must be a valid Ethereum address.");
    }

    const request = await this.requireRequest(input.requestId);
    const quote = this.requireQuote(request);
    const settlement = this.requireSettlement(request);
    await this.ensureCommercialQuoteUsable(request, quote);
    await this.ensureSettlementUsable(request, settlement);

    if (!request.latestPremiumPayment || !isLocked(request.latestPremiumPayment.status)) {
      throw new Error("Premium must be locked before an underwriter can lock capital.");
    }

    const quoteLock = await this.insuranceClient.getQuoteLock(settlement.id);
    if (quoteLock.state !== 1) {
      throw new Error("Settlement capital is not locked on-chain.");
    }
    if (quoteLock.underwriterAddress.toLowerCase() !== input.underwriterAddress.toLowerCase()) {
      throw new Error("The on-chain capital lock belongs to another underwriter.");
    }
    if (quoteLock.amountWei !== BigInt(settlement.payoutCapWei)) {
      throw new Error("The locked on-chain capital does not match the settlement terms.");
    }

    const lockedAmountEth = ethers.formatEther(quoteLock.amountWei);
    await this.quoteRepository.updateCapitalLock({
      id: quote.id,
      underwriterAddress: input.underwriterAddress,
      status: "open",
      lockedAmountEth,
      capitalLockTxHash: input.transactionHash ?? null,
    });
    await this.capitalReservationRepository.create({
      requestId: request.id,
      quoteId: quote.id,
      settlementId: settlement.id,
      policyId: null,
      reservedAmountEur: quote.payoutCapEur,
      reservedAmountEth: lockedAmountEth,
      status: "settlement_locked",
    });
    await this.settlementRepository.updateStatus({
      id: settlement.id,
      status: "ready_for_activation",
      underwriterAddress: input.underwriterAddress,
    });
    await this.requestRepository.updateStatus(
      request.id,
      deriveRequestStatus({ settlementPrepared: true, premiumLocked: true, capitalLocked: true })
    );

    await this.notify([request.farmerAddress, input.underwriterAddress], {
      type: "capital_locked",
      title: "Capital blocat",
      message: `Un underwriter a blocat capitalul pentru cererea #${request.id}. Polita este gata de activare.`,
      entityType: "insurance_request",
      entityId: request.id,
      dedupeKey: `capital_locked:${settlement.id}`,
      metadata: {
        quoteId: quote.id,
        settlementId: settlement.id,
        underwriterAddress: input.underwriterAddress,
        amountEth: lockedAmountEth,
        transactionHash: input.transactionHash ?? null,
      },
    });

    return this.requestRepository.getByIdWithLatestQuote(request.id);
  }

  async releaseLockedPremium(input: { requestId: number; payerAddress: string; transactionHash?: string | null }) {
    if (!ethers.isAddress(input.payerAddress)) {
      throw new Error("payerAddress must be a valid Ethereum address.");
    }

    const request = await this.requireRequest(input.requestId);
    const settlement = this.requireSettlement(request);
    if (request.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("Only the farmer attached to the request can release the premium.");
    }

    const premiumLock = await this.insuranceClient.getPremiumLock(settlement.id);
    if (premiumLock.state !== 3) {
      throw new Error("Premium has not been released on-chain.");
    }
    if (premiumLock.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("The released premium lock belongs to another farmer.");
    }

    await this.premiumPaymentRepository.updateLatestBySettlementId({
      settlementId: settlement.id,
      status: "released",
      transactionHash: input.transactionHash ?? null,
      amountEth: premiumLock.amountEth,
      asset: "ETH_ESCROW",
    });
    await this.settlementRepository.updateStatus({ id: settlement.id, status: "prepared" });
    await this.requestRepository.updateStatus(request.id, "awaiting_farmer_lock");

    return this.requestRepository.getByIdWithLatestQuote(request.id);
  }

  async releaseLockedQuoteCapital(input: { requestId: number; underwriterAddress: string }) {
    if (!ethers.isAddress(input.underwriterAddress)) {
      throw new Error("underwriterAddress must be a valid Ethereum address.");
    }

    const request = await this.requireRequest(input.requestId);
    const quote = this.requireQuote(request);
    const settlement = this.requireSettlement(request);
    const quoteLock = await this.insuranceClient.getQuoteLock(settlement.id);
    if (quoteLock.state !== 3) {
      throw new Error("Capital has not been released on-chain.");
    }
    if (quoteLock.underwriterAddress.toLowerCase() !== input.underwriterAddress.toLowerCase()) {
      throw new Error("The released capital lock belongs to another underwriter.");
    }

    await this.quoteRepository.updateCapitalLock({
      id: quote.id,
      underwriterAddress: "system",
      status: "open",
      lockedAmountEth: null,
      capitalLockTxHash: null,
    });
    await this.capitalReservationRepository.updateStatusBySettlementId({
      settlementId: settlement.id,
      status: "released",
    });
    await this.settlementRepository.updateStatus({ id: settlement.id, status: "premium_locked" });
    await this.requestRepository.updateStatus(request.id, "awaiting_underwriter");

    return this.requestRepository.getByIdWithLatestQuote(request.id);
  }

  async activatePolicyFromQuote(input: { requestId: number }) {
    const request = await this.requireRequest(input.requestId);
    const quote = this.requireQuote(request);
    const settlement = this.requireSettlement(request);
    await this.ensureCommercialQuoteUsable(request, quote);
    await this.ensureSettlementUsable(request, settlement);

    if (request.status !== "ready_for_activation") {
      throw new Error("Policy can be activated only after premium lock and capital lock.");
    }
    if (!request.latestPremiumPayment || !isLocked(request.latestPremiumPayment.status)) {
      throw new Error("Premium must be locked before activating the policy.");
    }
    if (!request.latestReservation || request.latestReservation.status !== "settlement_locked") {
      throw new Error("The request does not have locked capital ready for activation.");
    }

    const premiumLock = await this.insuranceClient.getPremiumLock(settlement.id);
    const quoteLock = await this.insuranceClient.getQuoteLock(settlement.id);
    if (premiumLock.state !== 1 || quoteLock.state !== 1) {
      throw new Error("Settlement locks are not active on-chain.");
    }

    const contract = await this.contractService.createContractFromQuote({
      quoteId: settlement.id,
      userAddress: request.farmerAddress,
      insuranceRequestId: request.id,
      insuranceQuoteId: quote.id,
      locationId: request.locationId,
      cropType: request.cropType,
      thresholdScore: quote.triggerThresholdScore,
      emergencyRain24h: quote.triggerEmergencyRain24h,
      startTime: request.coverageStart.toISOString(),
      endTime: request.coverageEnd.toISOString(),
    });

    const reservation = await this.capitalReservationRepository.updateForPolicy({
      settlementId: settlement.id,
      policyId: contract.contractId,
      status: "policy_reserved",
    });
    await this.quoteRepository.updateStatus(quote.id, "converted_to_policy");
    await this.settlementRepository.updateStatus({ id: settlement.id, status: "converted" });
    await this.premiumPaymentRepository.updateLatestBySettlementId({
      settlementId: settlement.id,
      status: "converted_to_policy",
      amountEth: premiumLock.amountEth,
      asset: "ETH_ESCROW",
    });
    await this.requestRepository.updateStatus(request.id, "activated");

    await this.notify([request.farmerAddress, quoteLock.underwriterAddress], {
      type: "policy_activated",
      title: "Polita activata",
      message: `Cererea #${request.id} a fost activata ca polita #${contract.contractId}.`,
      entityType: "policy",
      entityId: contract.contractId,
      dedupeKey: `policy_activated:${contract.contractId}`,
      metadata: {
        requestId: request.id,
        quoteId: quote.id,
        settlementId: settlement.id,
        policyId: contract.contractId,
        transactionHash: contract.transactionHash,
      },
    });

    return {
      contract,
      reservation,
      request: await this.requestRepository.getByIdWithLatestQuote(request.id),
    };
  }

  private async notify(
    recipients: string[],
    notification: {
      type: string;
      title: string;
      message: string;
      entityType: string;
      entityId?: number | null;
      dedupeKey?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) {
    const uniqueRecipients = [...new Set(recipients.map((recipient) => recipient.toLowerCase()))];
    try {
      await this.notificationRepository.createMany(
        uniqueRecipients.map((recipientAddress) => ({
          recipientAddress,
          ...notification,
        }))
      );
    } catch (error) {
      console.warn("Unable to create notification", error);
    }
  }

  private async requireRequest(requestId: number) {
    const request = await this.requestRepository.getByIdWithLatestQuote(requestId);
    if (!request) {
      throw new Error("Insurance request not found.");
    }
    return request;
  }

  private requireQuote(request: InsuranceRequestDetails) {
    if (!request.latestQuote) {
      throw new Error("Insurance request does not have a generated quote.");
    }
    return request.latestQuote;
  }

  private requireSettlement(request: InsuranceRequestDetails) {
    if (!request.latestSettlement) {
      throw new Error("Prepare a settlement session before locking funds.");
    }
    return request.latestSettlement;
  }

  private async ensureCommercialQuoteUsable(
    request: InsuranceRequestDetails,
    quote: InsuranceQuote
  ) {
    if (quote.expiresAt.getTime() <= Date.now()) {
      if (quote.status === "open") {
        await this.quoteRepository.updateStatus(quote.id, "expired");
      }
      await this.notify([request.farmerAddress], {
        type: "quote_expired",
        title: "Oferta a expirat",
        message: `Oferta pentru cererea #${request.id} a expirat si trebuie recalculata inainte de continuarea fluxului.`,
        entityType: "insurance_request",
        entityId: request.id,
        dedupeKey: `quote_expired:${quote.id}`,
        metadata: {
          quoteId: quote.id,
          expiredAt: quote.expiresAt.toISOString(),
        },
      });
      throw new Error("Commercial quote has expired. Generate a new quote in EUR.");
    }
    if (quote.status !== "open") {
      throw new Error("Commercial quote is not available for settlement.");
    }
  }

  private async ensureSettlementUsable(
    request: InsuranceRequestDetails,
    settlement: QuoteSettlement
  ) {
    if (!settlementIsOpen(settlement.status)) {
      throw new Error("Settlement session is not active.");
    }
    if (settlement.status === "prepared" && settlement.expiresAt.getTime() <= Date.now()) {
      await this.settlementRepository.updateStatus({ id: settlement.id, status: "expired" });
      if (!isLocked(request.latestPremiumPayment?.status) && !isLocked(request.latestReservation?.status)) {
        await this.requestRepository.updateStatus(request.id, "quoted");
      }
      await this.notify([request.farmerAddress], {
        type: "settlement_expired",
        title: "Settlement ETH expirat",
        message: `Settlement-ul ETH pentru cererea #${request.id} a expirat. Pregateste un settlement nou la cursul curent.`,
        entityType: "insurance_request",
        entityId: request.id,
        dedupeKey: `settlement_expired:${settlement.id}`,
        metadata: {
          settlementId: settlement.id,
          expiresAt: settlement.expiresAt.toISOString(),
        },
      });
      throw new Error("Settlement session has expired. Refresh ETH settlement terms.");
    }
  }
}
