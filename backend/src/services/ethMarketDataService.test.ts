import assert from "node:assert/strict";
import test from "node:test";
import { EthMarketDataService } from "./ethMarketDataService";

test("settlement terms round up to whole Wei-compatible micro-ETH units", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: {
          currency: "ETH",
          rates: { EUR: "2000" },
        },
      })
    )) as typeof fetch;

  try {
    const service = new EthMarketDataService("https://example.test", 0);
    const terms = await service.getQuoteSettlementTerms({
      payoutCapEur: 1_001,
      premiumAmountEur: 35.25,
    });

    assert.equal(terms.ethEurRate, 2000);
    assert.equal(terms.capitalLockWei, "500500000000000000");
    assert.equal(terms.premiumLockWei, "17625000000000000");
    assert.equal(terms.rateSource, "coinbase");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
