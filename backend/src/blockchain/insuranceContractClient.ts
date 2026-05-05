import fs from "fs";
import {
  Contract,
  TransactionReceipt,
  InterfaceAbi,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  ethers,
} from "ethers";
import { ensureConfigured, env } from "../config/env";
import { OracleReportPayload } from "../types/payout";

export type CreatePolicyParams = {
  userAddress: string;
  locationId: string;
  cropType: string;
  thresholdScore: number;
  emergencyRain24h: number;
  payoutAmountWei: bigint;
  startTime: Date;
  endTime: Date;
};

type PolicySnapshot = {
  user: string;
  underwriter: string;
  locationId: string;
  cropType: string;
  thresholdScore: bigint;
  emergencyRain24h: bigint;
  payoutAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  lastOracleUpdateAt: bigint;
  lastRiskScore: bigint;
  payoutTriggered: boolean;
  state: number;
};

const loadAbi = (): InterfaceAbi => {
  const raw = fs.readFileSync(env.insuranceContractAbiPath, "utf8");
  const parsed = JSON.parse(raw) as { abi?: unknown[] };

  if (!parsed.abi) {
    throw new Error(`ABI file ${env.insuranceContractAbiPath} does not contain an abi array.`);
  }

  return parsed.abi as InterfaceAbi;
};

export class InsuranceContractClient {
  private readonly provider: JsonRpcProvider;
  private readonly abi: InterfaceAbi;
  private ownerSigner: NonceManager | null = null;
  private oracleSigner: NonceManager | null = null;

  constructor() {
    ensureConfigured([
      ["INSURANCE_CONTRACT_ADDRESS", env.insuranceContractAddress],
      ["RPC_URL", env.rpcUrl],
    ]);

    this.provider = new JsonRpcProvider(env.rpcUrl);
    this.abi = loadAbi();
  }

  private getOwnerSigner() {
    if (!this.ownerSigner) {
      ensureConfigured([["POLICY_MANAGER_PRIVATE_KEY", env.policyManagerPrivateKey]]);
      this.ownerSigner = new NonceManager(
        new Wallet(env.policyManagerPrivateKey, this.provider)
      );
    }

    return this.ownerSigner;
  }

  private getOracleSigner() {
    if (!this.oracleSigner) {
      ensureConfigured([["ORACLE_PRIVATE_KEY", env.oraclePrivateKey]]);
      this.oracleSigner = new NonceManager(
        new Wallet(env.oraclePrivateKey, this.provider)
      );
    }

    return this.oracleSigner;
  }

  private getOwnerContract() {
    return new Contract(env.insuranceContractAddress, this.abi, this.getOwnerSigner());
  }

  private getOracleContract() {
    return new Contract(env.insuranceContractAddress, this.abi, this.getOracleSigner());
  }

  private getReadContract() {
    return new Contract(env.insuranceContractAddress, this.abi, this.provider);
  }

  async createPolicy(params: CreatePolicyParams) {
    const contract = this.getOwnerContract();
    const nextId = Number(await contract.policyCount());

    const tx = await contract.createPolicy(
      params.userAddress,
      params.locationId,
      params.cropType,
      params.thresholdScore,
      params.emergencyRain24h,
      params.payoutAmountWei,
      BigInt(Math.floor(params.startTime.getTime() / 1000)),
      BigInt(Math.floor(params.endTime.getTime() / 1000))
    );
    const receipt = await tx.wait();

    return {
      policyId: nextId,
      txHash: receipt?.hash ?? tx.hash,
    };
  }

  async createPolicyFromQuote(params: Omit<CreatePolicyParams, "payoutAmountWei"> & { quoteId: number }) {
    const contract = this.getOwnerContract();
    const nextId = Number(await contract.policyCount());

    const tx = await contract.createPolicyFromQuote(
      BigInt(params.quoteId),
      params.userAddress,
      params.locationId,
      params.cropType,
      params.thresholdScore,
      params.emergencyRain24h,
      BigInt(Math.floor(params.startTime.getTime() / 1000)),
      BigInt(Math.floor(params.endTime.getTime() / 1000))
    );
    const receipt = await tx.wait();

    return {
      policyId: nextId,
      txHash: receipt?.hash ?? tx.hash,
    };
  }

  async submitWeatherReport(policyId: number, report: OracleReportPayload) {
    const contract = this.getOracleContract();

    const tx = await contract.submitWeatherReport(policyId, {
      observedAt: BigInt(report.observedAt),
      rain1h: report.rain1h,
      rain24h: report.rain24h,
      rain72h: report.rain72h,
      consecutiveHeavyRainHours: report.consecutiveHeavyRainHours,
      eventDurationHours: report.eventDurationHours,
      windSpeed: report.windSpeed,
      temperature: report.temperature,
      humidity: report.humidity,
      weatherCondition: report.weatherCondition,
      riskScore: report.riskScore,
    });

    return {
      txHash: tx.hash,
    };
  }

  async waitForTransaction(
    txHash: string,
    confirmations = 1,
    timeoutMs = env.payoutConfirmationTimeoutMs
  ) {
    const receipt = await this.provider.waitForTransaction(txHash, confirmations, timeoutMs);
    if (!receipt) {
      throw new Error(`Timed out while waiting for transaction ${txHash}.`);
    }

    return {
      receipt,
      success: receipt.status === 1,
      gasUsed: receipt.gasUsed?.toString() ?? null,
      gasPrice: receipt.gasPrice?.toString() ?? receipt.fee?.toString() ?? null,
    };
  }

  async inspectTransaction(txHash: string) {
    const [receipt, tx] = await Promise.all([
      this.provider.getTransactionReceipt(txHash),
      this.provider.getTransaction(txHash),
    ]);

    if (receipt) {
      return {
        state: receipt.status === 1 ? "confirmed_success" : "confirmed_failed",
        txFound: true,
        receipt,
        gasUsed: receipt.gasUsed?.toString() ?? null,
        gasPrice: receipt.gasPrice?.toString() ?? receipt.fee?.toString() ?? null,
      } as const;
    }

    if (tx) {
      return {
        state: "pending",
        txFound: true,
        receipt: null,
        gasUsed: null,
        gasPrice: null,
      } as const;
    }

    return {
      state: "missing",
      txFound: false,
      receipt: null,
      gasUsed: null,
      gasPrice: null,
    } as const;
  }

  async getPolicy(policyId: number) {
    const contract = this.getReadContract();
    const policy = (await contract.getPolicy(policyId)) as PolicySnapshot;

    return {
      userAddress: policy.user,
      underwriterAddress: policy.underwriter,
      locationId: policy.locationId,
      cropType: policy.cropType,
      thresholdScore: Number(policy.thresholdScore),
      emergencyRain24h: Number(policy.emergencyRain24h),
      payoutAmountWei: policy.payoutAmount,
      payoutAmountEth: ethers.formatEther(policy.payoutAmount),
      startTime: new Date(Number(policy.startTime) * 1000),
      endTime: new Date(Number(policy.endTime) * 1000),
      lastOracleUpdateAt:
        Number(policy.lastOracleUpdateAt) > 0
          ? new Date(Number(policy.lastOracleUpdateAt) * 1000)
          : null,
      lastRiskScore: Number(policy.lastRiskScore),
      payoutTriggered: policy.payoutTriggered,
      state: policy.state,
      active: policy.state === 0,
    };
  }

  async getUnderwriterCapitalAccount(underwriterAddress: string) {
    const contract = this.getReadContract();
    const [depositedWei, lockedWei, availableWei] =
      await contract.getUnderwriterCapitalAccount(underwriterAddress);

    return {
      depositedWei: BigInt(depositedWei),
      lockedWei: BigInt(lockedWei),
      availableWei: BigInt(availableWei),
      depositedEth: ethers.formatEther(depositedWei),
      lockedEth: ethers.formatEther(lockedWei),
      availableEth: ethers.formatEther(availableWei),
    };
  }

  async getQuoteLock(quoteId: number) {
    const contract = this.getReadContract();
    const [underwriterAddress, amountWei, state] = await contract.getQuoteLock(BigInt(quoteId));

    return {
      underwriterAddress: String(underwriterAddress),
      amountWei: BigInt(amountWei),
      amountEth: ethers.formatEther(amountWei),
      state: Number(state),
    };
  }

  async getPremiumLock(quoteId: number) {
    const contract = this.getReadContract();
    const [farmerAddress, amountWei, state] = await contract.getPremiumLock(BigInt(quoteId));

    return {
      farmerAddress: String(farmerAddress),
      amountWei: BigInt(amountWei),
      amountEth: ethers.formatEther(amountWei),
      state: Number(state),
    };
  }

  async getLatestReport(policyId: number) {
    const contract = this.getReadContract();
    const report = await contract.getLatestReport(policyId);

    return {
      observedAt: Number(report.observedAt),
      rain1h: Number(report.rain1h),
      rain24h: Number(report.rain24h),
      rain72h: Number(report.rain72h),
      consecutiveHeavyRainHours: Number(report.consecutiveHeavyRainHours),
      eventDurationHours: Number(report.eventDurationHours),
      windSpeed: Number(report.windSpeed),
      temperature: Number(report.temperature),
      humidity: Number(report.humidity),
      weatherCondition: String(report.weatherCondition),
      riskScore: Number(report.riskScore),
    };
  }
}
