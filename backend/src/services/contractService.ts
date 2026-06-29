import { ethers } from "ethers";
import { InsuranceContractClient } from "../blockchain/insuranceContractClient";
import { ContractRepository } from "../repositories/contractRepository";
import { LocationIntakeService } from "./locationIntakeService";

export type CreateContractRequest = {
  userAddress: string;
  underwriterAddress?: string | null;
  fundingSource?: string;
  quoteId?: number;
  locationId?: string;
  insuranceRequestId?: number;
  insuranceQuoteId?: number;
  locationLabel?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  locationGeoJson?: unknown;
  cropType: string;
  thresholdScore?: number;
  emergencyRain24h?: number;
  payoutAmountEth: string;
  startTime: string;
  endTime: string;
};

type ContractServiceDeps = {
  contractRepository?: ContractRepository;
  insuranceClient?: InsuranceContractClient;
  locationIntakeService?: LocationIntakeService;
};

const normalizeAddress = (address?: string | null) => {
  if (!address || !ethers.isAddress(address)) {
    return null;
  }

  return address.toLowerCase();
};

const isMissingOnChainPolicy = (error: unknown) =>
  error instanceof Error && error.message.includes("PolicyNotFound");

export class ContractService {
  private readonly contractRepository: ContractRepository;
  private readonly insuranceClient: InsuranceContractClient;
  private readonly locationIntakeService: LocationIntakeService;

  constructor(deps: ContractServiceDeps = {}) {
    this.contractRepository = deps.contractRepository ?? new ContractRepository();
    this.insuranceClient = deps.insuranceClient ?? new InsuranceContractClient();
    this.locationIntakeService =
      deps.locationIntakeService ?? new LocationIntakeService();
  }

  async createContract(input: CreateContractRequest) {
    if (!ethers.isAddress(input.userAddress)) {
      throw new Error("userAddress must be a valid Ethereum address.");
    }

    if (!input.cropType.trim()) {
      throw new Error("cropType is required.");
    }

    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new Error("startTime and endTime must be valid ISO timestamps.");
    }

    if (endTime <= startTime) {
      throw new Error("endTime must be greater than startTime.");
    }

    const payoutAmountWei = ethers.parseEther(input.payoutAmountEth);
    const thresholdScore = Number(input.thresholdScore ?? 8);
    const emergencyRain24h = Number(input.emergencyRain24h ?? 80);

    if (Number.isNaN(thresholdScore) || thresholdScore <= 0) {
      throw new Error("thresholdScore must be a positive number.");
    }

    if (Number.isNaN(emergencyRain24h) || emergencyRain24h <= 0) {
      throw new Error("emergencyRain24h must be a positive number.");
    }

    const location = await this.locationIntakeService.resolveLocation(
      {
        userAddress: input.userAddress,
        locationId: input.locationId,
        locationLabel: input.locationLabel,
        latitude: input.latitude,
        longitude: input.longitude,
        locationGeoJson: input.locationGeoJson,
      },
      "contract_create"
    );

    const onChain = await this.insuranceClient.createPolicy({
      userAddress: input.userAddress,
      locationId: location.locationId,
      cropType: input.cropType.trim(),
      thresholdScore,
      emergencyRain24h,
      payoutAmountWei,
      startTime,
      endTime,
    });

    const record = await this.contractRepository.create({
      id: onChain.policyId,
      userAddress: input.userAddress,
      underwriterAddress: input.underwriterAddress ?? null,
      fundingSource: input.fundingSource ?? "shared_pool",
      locationId: location.locationId,
      insuranceRequestId: input.insuranceRequestId,
      insuranceQuoteId: input.insuranceQuoteId,
      locationLabel: location.locationLabel,
      latitude: location.latitude,
      longitude: location.longitude,
      cropType: input.cropType.trim(),
      thresholdScore,
      payoutAmount: input.payoutAmountEth,
      active: true,
      emergencyRain24h,
      startTime,
      endTime,
    });

    return {
      contractId: Number(record.id),
      locationId: location.locationId,
      transactionHash: onChain.txHash,
      contract: record,
    };
  }

  async createContractFromQuote(input: Omit<CreateContractRequest, "payoutAmountEth"> & { quoteId: number }) {
    if (!ethers.isAddress(input.userAddress)) {
      throw new Error("userAddress must be a valid Ethereum address.");
    }

    if (!input.cropType.trim()) {
      throw new Error("cropType is required.");
    }

    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new Error("startTime and endTime must be valid ISO timestamps.");
    }

    if (endTime <= startTime) {
      throw new Error("endTime must be greater than startTime.");
    }

    const thresholdScore = Number(input.thresholdScore ?? 8);
    const emergencyRain24h = Number(input.emergencyRain24h ?? 80);

    if (Number.isNaN(thresholdScore) || thresholdScore <= 0) {
      throw new Error("thresholdScore must be a positive number.");
    }

    if (Number.isNaN(emergencyRain24h) || emergencyRain24h <= 0) {
      throw new Error("emergencyRain24h must be a positive number.");
    }

    const location = await this.locationIntakeService.resolveLocation(
      {
        userAddress: input.userAddress,
        locationId: input.locationId,
        locationLabel: input.locationLabel,
        latitude: input.latitude,
        longitude: input.longitude,
        locationGeoJson: input.locationGeoJson,
      },
      "contract_create_from_quote"
    );

    const quoteLock = await this.insuranceClient.getQuoteLock(input.quoteId);
    if (quoteLock.state !== 1) {
      throw new Error("Quote capital is not locked on-chain.");
    }

    const onChain = await this.insuranceClient.createPolicyFromQuote(input.quoteId);

    const record = await this.contractRepository.create({
      id: onChain.policyId,
      userAddress: input.userAddress,
      underwriterAddress: quoteLock.underwriterAddress,
      fundingSource: "quote_lock",
      locationId: location.locationId,
      insuranceRequestId: input.insuranceRequestId,
      insuranceQuoteId: input.insuranceQuoteId,
      locationLabel: location.locationLabel,
      latitude: location.latitude,
      longitude: location.longitude,
      cropType: input.cropType.trim(),
      thresholdScore,
      payoutAmount: quoteLock.amountEth,
      active: true,
      emergencyRain24h,
      startTime,
      endTime,
    });

    return {
      contractId: Number(record.id),
      locationId: location.locationId,
      transactionHash: onChain.txHash,
      payoutAmountEth: quoteLock.amountEth,
      underwriterAddress: quoteLock.underwriterAddress,
      contract: record,
    };
  }

  async getContract(contractId: number) {
    const dbContract = await this.contractRepository.getById(contractId);
    const onChainContract = await this.insuranceClient.getPolicy(contractId);
    const latestReport = await this.insuranceClient.getLatestReport(contractId);

    return {
      dbContract,
      onChainContract: {
        ...onChainContract,
        payoutAmountWei: onChainContract.payoutAmountWei.toString(),
      },
      latestReport,
    };
  }

  async listContracts() {
    return this.contractRepository.listAll();
  }

  async canViewContract(contractId: number, viewerAddress?: string | null) {
    const [contract, ownerAddress] = await Promise.all([
      this.contractRepository.getById(contractId),
      this.insuranceClient.getOwner(),
    ]);
    if (!contract) {
      return { exists: false, allowed: false };
    }

    const viewer = normalizeAddress(viewerAddress);
    if (!viewer) {
      return { exists: true, allowed: false };
    }

    const owner = ownerAddress.toLowerCase();
    const isOwner = viewer === owner;
    const isFarmer = contract.user_address.toLowerCase() === viewer;
    const isUnderwriter =
      !!contract.underwriter_address &&
      contract.underwriter_address.toLowerCase() === viewer;

    return {
      exists: true,
      allowed: isOwner || isFarmer || isUnderwriter,
    };
  }

  async listPolicies(viewerAddress?: string | null) {
    const [contracts, ownerAddress] = await Promise.all([
      this.contractRepository.listAll(),
      this.insuranceClient.getOwner(),
    ]);
    const viewer = normalizeAddress(viewerAddress);
    const owner = ownerAddress.toLowerCase();

    const visibleContracts =
      viewer && viewer === owner
        ? contracts
        : contracts.filter((contract) => {
            if (!viewer) {
              return false;
            }

            const isFarmer = contract.user_address.toLowerCase() === viewer;
            const isUnderwriter =
              !!contract.underwriter_address &&
              contract.underwriter_address.toLowerCase() === viewer;

            return isFarmer || isUnderwriter;
          });

    const policies = await Promise.all(
      visibleContracts.map(async (contract) => {
        try {
        const policy = await this.insuranceClient.getPolicy(Number(contract.id));
        return {
          id: Number(contract.id),
          user: policy.userAddress,
          underwriter: policy.underwriterAddress,
          locationId: contract.location_id,
          locationLabel: contract.location_label,
          latitude: contract.latitude === null ? null : Number(contract.latitude),
          longitude: contract.longitude === null ? null : Number(contract.longitude),
          cropType: policy.cropType,
          thresholdScore: policy.thresholdScore,
          emergencyRain24h: policy.emergencyRain24h,
          payoutWei: policy.payoutAmountWei.toString(),
          payoutEth: policy.payoutAmountEth,
          startTime: Math.floor(policy.startTime.getTime() / 1000),
          endTime: Math.floor(policy.endTime.getTime() / 1000),
          lastOracleUpdateAt: policy.lastOracleUpdateAt
            ? Math.floor(policy.lastOracleUpdateAt.getTime() / 1000)
            : 0,
          lastRiskScore: policy.lastRiskScore,
          payoutTriggered: policy.payoutTriggered,
          state: policy.state,
        };
        } catch (error) {
          // A local Hardhat reset invalidates old on-chain IDs while PostgreSQL persists.
          if (isMissingOnChainPolicy(error)) {
            return null;
          }

          throw error;
        }
      })
    );

    return policies.filter((policy): policy is NonNullable<typeof policy> => policy !== null);
  }
}
