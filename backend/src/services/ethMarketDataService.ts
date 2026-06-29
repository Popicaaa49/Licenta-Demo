export type QuoteSettlementTerms = {
  ethEurRate: number;
  capitalLockEth: number;
  capitalLockWei: string;
  premiumLockEth: number;
  premiumLockWei: string;
  rateSource: "coinbase";
  fetchedAt: string;
};

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export class EthMarketDataService {
  private cachedRate:
    | {
        ethEurRate: number;
        fetchedAt: number;
      }
    | null = null;

  constructor(
    private readonly exchangeRatesBaseUrl = "https://api.coinbase.com/v2/exchange-rates",
    private readonly cacheTtlMs = 60_000
  ) {}

  async getQuoteSettlementTerms(input: {
    payoutCapEur: number;
    premiumAmountEur: number;
  }): Promise<QuoteSettlementTerms> {
    const { ethEurRate, fetchedAt } = await this.getEthEurRate();
    const capitalLockEth = round(input.payoutCapEur / ethEurRate, 6);
    const premiumLockEth = round(input.premiumAmountEur / ethEurRate, 6);
    const capitalLockWei =
      BigInt(Math.ceil(capitalLockEth * 1_000_000)) * BigInt(1_000_000_000_000);
    const premiumLockWei =
      BigInt(Math.ceil(premiumLockEth * 1_000_000)) * BigInt(1_000_000_000_000);

    return {
      ethEurRate,
      capitalLockEth,
      capitalLockWei: capitalLockWei.toString(),
      premiumLockEth,
      premiumLockWei: premiumLockWei.toString(),
      rateSource: "coinbase",
      fetchedAt: new Date(fetchedAt).toISOString(),
    };
  }

  private async getEthEurRate() {
    if (this.cachedRate && Date.now() - this.cachedRate.fetchedAt <= this.cacheTtlMs) {
      return this.cachedRate;
    }

    const response = await fetch(`${this.exchangeRatesBaseUrl}?currency=ETH`);
    if (!response.ok) {
      throw new Error("Unable to load the ETH/EUR rate from Coinbase.");
    }

    const payload = (await response.json()) as {
      data?: {
        currency?: string;
        rates?: Record<string, string>;
      };
    };

    const ethEurRate = Number(payload.data?.rates?.EUR ?? "");
    if (!Number.isFinite(ethEurRate) || ethEurRate <= 0) {
      throw new Error("Coinbase did not return a valid ETH/EUR rate.");
    }

    this.cachedRate = {
      ethEurRate: round(ethEurRate, 2),
      fetchedAt: Date.now(),
    };

    return this.cachedRate;
  }
}
