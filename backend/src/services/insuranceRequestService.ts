import { ethers } from "ethers";
import { env } from "../config/env";
import { InsuranceContractClient } from "../blockchain/insuranceContractClient";
import { CropReferenceRepository } from "../repositories/cropReferenceRepository";
import { CapitalReservationRepository } from "../repositories/capitalReservationRepository";
import { InsuranceQuoteRepository } from "../repositories/insuranceQuoteRepository";
import { InsuranceRequestRepository } from "../repositories/insuranceRequestRepository";
import { PremiumPaymentRepository } from "../repositories/premiumPaymentRepository";
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
  premiumPaymentRepository?: PremiumPaymentRepository;
  capitalReservationRepository?: CapitalReservationRepository;
  cropReferenceRepository?: CropReferenceRepository;
  underwritingService?: UnderwritingService;
  locationIntakeService?: LocationIntakeService;
  contractService?: ContractService;
  insuranceClient?: InsuranceContractClient;
  ethMarketDataService?: EthMarketDataService;
};

const parseArea = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
};

const hasLockedPremium = (status: string | undefined | null) => status === "locked";
const hasLockedCapital = (status: string | undefined | null) => status === "locked";

const deriveRequestStatus = (input: {
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
    return "awaiting_premium";
  }

  return "awaiting_farmer_lock";
};

export class InsuranceRequestService {
  private readonly requestRepository: InsuranceRequestRepository;
  private readonly quoteRepository: InsuranceQuoteRepository;
  private readonly premiumPaymentRepository: PremiumPaymentRepository;
  private readonly capitalReservationRepository: CapitalReservationRepository;
  private readonly cropReferenceRepository: CropReferenceRepository;
  private readonly underwritingService: UnderwritingService;
  private readonly locationIntakeService: LocationIntakeService;
  private readonly contractService: ContractService;
  private readonly insuranceClient: InsuranceContractClient;
  private readonly ethMarketDataService: EthMarketDataService;

  constructor(deps: InsuranceRequestServiceDeps = {}) {
    this.requestRepository = deps.requestRepository ?? new InsuranceRequestRepository();
    this.quoteRepository = deps.quoteRepository ?? new InsuranceQuoteRepository();
    this.premiumPaymentRepository =
      deps.premiumPaymentRepository ?? new PremiumPaymentRepository();
    this.capitalReservationRepository =
      deps.capitalReservationRepository ?? new CapitalReservationRepository();
    this.cropReferenceRepository =
      deps.cropReferenceRepository ?? new CropReferenceRepository();
    this.underwritingService = deps.underwritingService ?? new UnderwritingService();
    this.locationIntakeService =
      deps.locationIntakeService ?? new LocationIntakeService();
    this.contractService = deps.contractService ?? new ContractService();
    this.insuranceClient = deps.insuranceClient ?? new InsuranceContractClient();
    this.ethMarketDataService =
      deps.ethMarketDataService ??
      new EthMarketDataService(env.ethExchangeRatesBaseUrl, env.ethExchangeRatesCacheTtlMs);
  }

  async listCropCatalog() {
    return this.cropReferenceRepository.listActive();
  }

  async listRequests() {
    const requests = await this.requestRepository.listAllWithLatestQuote();
    return Promise.all(requests.map((request) => this.enrichRequestWithLivePricing(request)));
  }

  async getRequest(id: number) {
    const request = await this.requestRepository.getByIdWithLatestQuote(id);
    return this.enrichRequestWithLivePricing(request);
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

    if (
      Number.isNaN(coverageStart.getTime()) ||
      Number.isNaN(coverageEnd.getTime())
    ) {
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
      status: "awaiting_farmer_lock",
    });

    const quoteDraft = await this.underwritingService.buildQuote({
      locationId: location.locationId,
      cropType,
      areaHa,
      coverageStart,
      coverageEnd,
    });

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
      breakdown: quoteDraft.breakdown,
    });

    return {
      request,
      quote: await this.enrichQuoteWithLivePricing(quote),
      location,
    };
  }

  async lockLatestQuoteCapital(input: {
    requestId: number;
    underwriterAddress: string;
    lockedAmountEth: string;
    transactionHash?: string | null;
  }) {
    if (!ethers.isAddress(input.underwriterAddress)) {
      throw new Error("underwriterAddress must be a valid Ethereum address.");
    }

    let expectedAmountWei: bigint;
    try {
      expectedAmountWei = ethers.parseEther(input.lockedAmountEth);
    } catch {
      throw new Error("lockedAmountEth must be a valid ETH amount.");
    }

    if (expectedAmountWei <= 0n) {
      throw new Error("lockedAmountEth must be greater than zero.");
    }

    const request = await this.requestRepository.getByIdWithLatestQuote(input.requestId);
    if (!request) {
      throw new Error("Insurance request not found.");
    }

    if (!request.latestQuote) {
      throw new Error("Insurance request does not have a generated quote.");
    }

    if (!request.latestPremiumPayment || request.latestPremiumPayment.status !== "locked") {
      throw new Error("Premium must be locked before an underwriter can lock capital.");
    }

    if (request.latestQuote.status !== "open") {
      throw new Error("Only open quotes can be locked.");
    }

    const livePricing = await this.ethMarketDataService
      .getLiveEthPricing({
        payoutCapEur: request.latestQuote.payoutCapEur,
        premiumAmountEur: request.latestQuote.premiumAmountEur,
      })
      .catch(() => null);
    if (livePricing && expectedAmountWei < BigInt(livePricing.capitalLockWei)) {
      throw new Error(
        `Locked capital is below the live requirement. Required: ${livePricing.capitalLockEth} ETH for ${request.latestQuote.payoutCapEur} EUR at ${livePricing.ethEurRate} EUR/ETH.`
      );
    }

    const quoteLock = await this.insuranceClient.getQuoteLock(request.latestQuote.id);
    if (quoteLock.state !== 1) {
      throw new Error("Quote capital is not locked on-chain.");
    }

    if (quoteLock.underwriterAddress.toLowerCase() !== input.underwriterAddress.toLowerCase()) {
      throw new Error("The on-chain quote lock belongs to another underwriter.");
    }

    if (quoteLock.amountWei !== expectedAmountWei) {
      throw new Error("The locked on-chain capital does not match the requested ETH amount.");
    }

    const normalizedAmountEth = ethers.formatEther(expectedAmountWei);

    const quote = await this.quoteRepository.updateCapitalLock({
      id: request.latestQuote.id,
      underwriterAddress: input.underwriterAddress,
      status: "locked",
      lockedAmountEth: normalizedAmountEth,
      capitalLockTxHash: input.transactionHash ?? null,
    });
    if (!quote) {
      throw new Error("Failed to update quote lock metadata.");
    }

    await this.capitalReservationRepository.create({
      requestId: request.id,
      quoteId: request.latestQuote.id,
      policyId: null,
      reservedAmountEur: request.latestQuote.payoutCapEur,
      reservedAmountEth: normalizedAmountEth,
      status: "quote_locked",
    });

    await this.requestRepository.updateStatus(
      request.id,
      deriveRequestStatus({
        premiumLocked: hasLockedPremium(request.latestPremiumPayment?.status),
        capitalLocked: true,
      })
    );

    return this.requestRepository.getByIdWithLatestQuote(request.id);
  }

  async releaseLockedQuoteCapital(input: {
    requestId: number;
    underwriterAddress: string;
  }) {
    if (!ethers.isAddress(input.underwriterAddress)) {
      throw new Error("underwriterAddress must be a valid Ethereum address.");
    }

    const request = await this.requestRepository.getByIdWithLatestQuote(input.requestId);
    if (!request) {
      throw new Error("Insurance request not found.");
    }

    if (!request.latestQuote) {
      throw new Error("Insurance request does not have a generated quote.");
    }

    if (request.latestQuote.status !== "locked") {
      throw new Error("Only locked quotes can release capital.");
    }

    const quoteLock = await this.insuranceClient.getQuoteLock(request.latestQuote.id);
    if (quoteLock.state !== 3) {
      throw new Error("Quote capital has not been released on-chain.");
    }

    if (quoteLock.underwriterAddress.toLowerCase() !== input.underwriterAddress.toLowerCase()) {
      throw new Error("The released quote lock belongs to another underwriter.");
    }

    const quote = await this.quoteRepository.updateCapitalLock({
      id: request.latestQuote.id,
      underwriterAddress: "system",
      status: "open",
      lockedAmountEth: null,
      capitalLockTxHash: null,
    });
    if (!quote) {
      throw new Error("Failed to reset quote lock metadata.");
    }

    await this.capitalReservationRepository.updateStatusByQuoteId({
      quoteId: request.latestQuote.id,
      status: "released",
    });
    await this.requestRepository.updateStatus(
      request.id,
      deriveRequestStatus({
        premiumLocked: hasLockedPremium(request.latestPremiumPayment?.status),
        capitalLocked: false,
      })
    );

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

    const request = await this.requestRepository.getByIdWithLatestQuote(input.requestId);
    if (!request) {
      throw new Error("Insurance request not found.");
    }

    if (!request.latestQuote) {
      throw new Error("Insurance request does not have a generated quote.");
    }

    if (request.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("Only the farmer attached to the request can lock the premium.");
    }

    const premiumLock = await this.insuranceClient.getPremiumLock(request.latestQuote.id);
    if (premiumLock.state !== 1) {
      throw new Error("Premium is not locked on-chain.");
    }

    const livePricing = await this.ethMarketDataService
      .getLiveEthPricing({
        payoutCapEur: request.latestQuote.payoutCapEur,
        premiumAmountEur: request.latestQuote.premiumAmountEur,
      })
      .catch(() => null);
    if (livePricing && premiumLock.amountWei < BigInt(livePricing.premiumLockWei)) {
      throw new Error(
        `Premium lock is below the live requirement. Required: ${livePricing.premiumLockEth} ETH for ${request.latestQuote.premiumAmountEur} EUR at ${livePricing.ethEurRate} EUR/ETH.`
      );
    }

    if (premiumLock.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("The on-chain premium lock belongs to another farmer.");
    }

    const payment = await this.premiumPaymentRepository.create({
      requestId: request.id,
      quoteId: request.latestQuote.id,
      payerAddress: input.payerAddress,
      amountEur: request.latestQuote.premiumAmountEur,
      amountEth: premiumLock.amountEth,
      asset: input.asset ?? "ETH_ESCROW",
      transactionHash: input.transactionHash ?? null,
      status: "locked",
    });

    await this.requestRepository.updateStatus(
      request.id,
      deriveRequestStatus({
        premiumLocked: true,
        capitalLocked: hasLockedCapital(request.latestQuote.status),
      })
    );

    return {
      payment,
      request: await this.requestRepository.getByIdWithLatestQuote(request.id),
    };
  }

  async releaseLockedPremium(input: {
    requestId: number;
    payerAddress: string;
    transactionHash?: string | null;
  }) {
    if (!ethers.isAddress(input.payerAddress)) {
      throw new Error("payerAddress must be a valid Ethereum address.");
    }

    const request = await this.requestRepository.getByIdWithLatestQuote(input.requestId);
    if (!request) {
      throw new Error("Insurance request not found.");
    }

    if (!request.latestQuote) {
      throw new Error("Insurance request does not have a generated quote.");
    }

    if (request.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("Only the farmer attached to the request can release the premium.");
    }

    const premiumLock = await this.insuranceClient.getPremiumLock(request.latestQuote.id);
    if (premiumLock.state !== 3) {
      throw new Error("Premium has not been released on-chain.");
    }

    if (premiumLock.farmerAddress.toLowerCase() !== input.payerAddress.toLowerCase()) {
      throw new Error("The released premium lock belongs to another farmer.");
    }

    await this.premiumPaymentRepository.updateLatestByQuoteId({
      quoteId: request.latestQuote.id,
      status: "released",
      transactionHash: input.transactionHash ?? null,
      amountEth: premiumLock.amountEth,
      asset: "ETH_ESCROW",
    });

    await this.requestRepository.updateStatus(
      request.id,
      deriveRequestStatus({
        premiumLocked: false,
        capitalLocked: hasLockedCapital(request.latestQuote.status),
      })
    );

    return this.requestRepository.getByIdWithLatestQuote(request.id);
  }

  async activatePolicyFromQuote(input: {
    requestId: number;
    thresholdScore?: number;
    emergencyRain24h?: number;
  }) {
    const request = await this.requestRepository.getByIdWithLatestQuote(input.requestId);
    if (!request) {
      throw new Error("Insurance request not found.");
    }

    if (!request.latestQuote) {
      throw new Error("Insurance request does not have a generated quote.");
    }

    if (request.status !== "ready_for_activation") {
      throw new Error("Policy can be activated only after premium lock and capital lock.");
    }

    if (request.latestQuote.status !== "locked") {
      throw new Error("Only locked quotes can be converted into policies.");
    }

    if (!request.latestPremiumPayment || request.latestPremiumPayment.status !== "locked") {
      throw new Error("Premium must be locked before activating the policy.");
    }

    if (
      !request.latestReservation ||
      request.latestReservation.status !== "quote_locked" ||
      request.latestReservation.reservedAmountEth === null
    ) {
      throw new Error("The request does not have locked capital ready for activation.");
    }

    const premiumLock = await this.insuranceClient.getPremiumLock(request.latestQuote.id);
    if (premiumLock.state !== 1) {
      throw new Error("Premium is not locked on-chain.");
    }

    const contract = await this.contractService.createContractFromQuote({
      quoteId: request.latestQuote.id,
      userAddress: request.farmerAddress,
      insuranceRequestId: request.id,
      insuranceQuoteId: request.latestQuote.id,
      locationId: request.locationId,
      cropType: request.cropType,
      thresholdScore: input.thresholdScore ?? 8,
      emergencyRain24h: input.emergencyRain24h ?? 80,
      startTime: request.coverageStart.toISOString(),
      endTime: request.coverageEnd.toISOString(),
    });

    const reservation = await this.capitalReservationRepository.updateForPolicy({
      quoteId: request.latestQuote.id,
      policyId: contract.contractId,
      status: "policy_reserved",
    });

    await this.quoteRepository.updateStatus(request.latestQuote.id, "converted_to_policy");
    await this.premiumPaymentRepository.updateLatestByQuoteId({
      quoteId: request.latestQuote.id,
      status: "converted_to_policy",
      amountEth: premiumLock.amountEth,
      asset: "ETH_ESCROW",
    });
    await this.requestRepository.updateStatus(request.id, "activated");

    return {
      contract,
      reservation,
      request: await this.enrichRequestWithLivePricing(
        await this.requestRepository.getByIdWithLatestQuote(request.id)
      ),
    };
  }

  private async enrichRequestWithLivePricing<
    T extends { latestQuote: { payoutCapEur: number; premiumAmountEur: number } | null } | null
  >(
    request: T
  ): Promise<T> {
    if (!request?.latestQuote) {
      return request;
    }

    return {
      ...request,
      latestQuote: await this.enrichQuoteWithLivePricing(request.latestQuote),
    };
  }

  private async enrichQuoteWithLivePricing<T extends { payoutCapEur: number; premiumAmountEur: number }>(
    quote: T
  ): Promise<T & { livePricing: Awaited<ReturnType<EthMarketDataService["getLiveEthPricing"]>> | null }> {
    try {
      const livePricing = await this.ethMarketDataService.getLiveEthPricing({
        payoutCapEur: quote.payoutCapEur,
        premiumAmountEur: quote.premiumAmountEur,
      });
      return {
        ...quote,
        livePricing,
      };
    } catch {
      return {
        ...quote,
        livePricing: null,
      };
    }
  }
}
