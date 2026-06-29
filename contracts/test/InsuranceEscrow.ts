import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("InsuranceEscrow", function () {
  async function deployFixture() {
    const [owner, oracle, farmer, outsider] = await ethers.getSigners();
    const InsuranceEscrow = await ethers.getContractFactory("InsuranceEscrow");
    const insurance = await InsuranceEscrow.connect(owner).deploy(oracle.address, {
      value: ethers.parseEther("5"),
    });
    await insurance.waitForDeployment();

    const now = await time.latest();
    const startTime = BigInt(now);
    const endTime = BigInt(now + 7 * 24 * 60 * 60);
    const payoutAmount = ethers.parseEther("1");

    await insurance
      .connect(owner)
      .createPolicy(
        farmer.address,
        "RO-TM-001",
        "wheat",
        8,
        80,
        payoutAmount,
        startTime,
        endTime
      );

    return { insurance, owner, oracle, farmer, outsider, payoutAmount, startTime, endTime };
  }

  it("pays the farmer automatically when risk score reaches the stored threshold", async function () {
    const { insurance, oracle, farmer, payoutAmount, startTime } = await loadFixture(
      deployFixture
    );

    const beforeBalance = await ethers.provider.getBalance(farmer.address);
    const tx = await insurance.connect(oracle).submitWeatherReport(0, {
      observedAt: startTime + 3600n,
      rain1h: 25,
      rain24h: 50,
      rain72h: 95,
      consecutiveHeavyRainHours: 3,
      eventDurationHours: 49,
      windSpeed: 18,
      temperature: 36,
      humidity: 92,
      weatherCondition: "thunderstorm",
      riskScore: 8,
    });

    await expect(tx)
      .to.emit(insurance, "PolicyPaidOut")
      .withArgs(0, farmer.address, ethers.ZeroAddress, payoutAmount, 8, 50);

    const policy = await insurance.getPolicy(0);
    expect(policy.state).to.equal(1);
    expect(policy.payoutTriggered).to.equal(true);

    const afterBalance = await ethers.provider.getBalance(farmer.address);
    expect(afterBalance - beforeBalance).to.equal(payoutAmount);
  });

  it("pays even with a lower score when rain in 24h exceeds the emergency threshold", async function () {
    const { insurance, oracle, farmer, startTime } = await loadFixture(deployFixture);

    await insurance.connect(oracle).submitWeatherReport(0, {
      observedAt: startTime + 7200n,
      rain1h: 10,
      rain24h: 81,
      rain72h: 120,
      consecutiveHeavyRainHours: 1,
      eventDurationHours: 6,
      windSpeed: 8,
      temperature: 24,
      humidity: 70,
      weatherCondition: "rain",
      riskScore: 3,
    });

    const policy = await insurance.getPolicy(0);
    expect(policy.state).to.equal(1);
    expect(policy.payoutTriggered).to.equal(true);

    const latestReport = await insurance.getLatestReport(0);
    expect(latestReport.rain24h).to.equal(81);
    expect(latestReport.riskScore).to.equal(3);
    expect(policy.user).to.equal(farmer.address);
  });

  it("accepts weather reports only from the configured oracle", async function () {
    const { insurance, outsider, startTime } = await loadFixture(deployFixture);

    await expect(
      insurance.connect(outsider).submitWeatherReport(0, {
        observedAt: startTime + 3600n,
        rain1h: 5,
        rain24h: 25,
        rain72h: 40,
        consecutiveHeavyRainHours: 0,
        eventDurationHours: 2,
        windSpeed: 7,
        temperature: 28,
        humidity: 60,
        weatherCondition: "clouds",
        riskScore: 2,
      })
    ).to.be.revertedWithCustomError(insurance, "NotOracle");
  });

  it("releases the locked reserve when the policy expires without a payout", async function () {
    const { insurance, payoutAmount, endTime } = await loadFixture(deployFixture);

    expect(await insurance.lockedReserve()).to.equal(payoutAmount);

    await time.increaseTo(Number(endTime) + 1);
    await expect(insurance.expirePolicy(0)).to.emit(insurance, "PolicyExpired").withArgs(0);

    const policy = await insurance.getPolicy(0);
    expect(policy.state).to.equal(2);
    expect(await insurance.lockedReserve()).to.equal(0);
  });

  async function registeredQuoteFixture() {
    const [owner, oracle, farmer, underwriter, outsider] = await ethers.getSigners();
    const InsuranceEscrow = await ethers.getContractFactory("InsuranceEscrow");
    const insurance = await InsuranceEscrow.connect(owner).deploy(oracle.address);
    await insurance.waitForDeployment();

    const now = await time.latest();
    const quoteId = 101n;
    const premiumAmount = ethers.parseEther("0.1");
    const payoutAmount = ethers.parseEther("1");
    const startTime = BigInt(now + 60);
    const endTime = BigInt(now + 7 * 24 * 60 * 60);
    const expiresAt = BigInt(now + 30 * 60);

    await insurance.connect(underwriter).fundUnderwriterCapital({ value: ethers.parseEther("2") });
    await insurance.connect(owner).registerQuote(
      quoteId,
      farmer.address,
      "RO-TM-001",
      "wheat",
      7,
      55,
      premiumAmount,
      payoutAmount,
      startTime,
      endTime,
      expiresAt
    );

    return {
      insurance,
      owner,
      oracle,
      farmer,
      underwriter,
      outsider,
      quoteId,
      premiumAmount,
      payoutAmount,
      startTime,
      endTime,
      expiresAt,
    };
  }

  it("enforces the registered quote amounts and creates the policy from immutable terms", async function () {
    const {
      insurance,
      owner,
      farmer,
      underwriter,
      outsider,
      quoteId,
      premiumAmount,
      payoutAmount,
      startTime,
      endTime,
    } = await loadFixture(registeredQuoteFixture);

    await expect(
      insurance.connect(outsider).lockPremiumForQuote(quoteId, { value: premiumAmount })
    ).to.be.revertedWithCustomError(insurance, "QuoteFarmerMismatch");

    await expect(
      insurance.connect(farmer).lockPremiumForQuote(quoteId, { value: premiumAmount - 1n })
    ).to.be.revertedWithCustomError(insurance, "QuotePremiumAmountMismatch");

    await insurance.connect(farmer).lockPremiumForQuote(quoteId, { value: premiumAmount });

    await expect(
      insurance.connect(underwriter).lockCapitalForQuote(quoteId, payoutAmount - 1n)
    ).to.be.revertedWithCustomError(insurance, "QuoteCapitalAmountMismatch");

    await insurance.connect(underwriter).lockCapitalForQuote(quoteId, payoutAmount);

    await expect(insurance.connect(owner).createPolicyFromQuote(quoteId))
      .to.emit(insurance, "PolicyCreated")
      .withArgs(
        0,
        farmer.address,
        underwriter.address,
        "RO-TM-001",
        "wheat",
        7,
        55,
        payoutAmount,
        startTime,
        endTime
      );

    const policy = await insurance.getPolicy(0);
    expect(policy.thresholdScore).to.equal(7);
    expect(policy.emergencyRain24h).to.equal(55);
    expect(policy.payoutAmount).to.equal(payoutAmount);
    expect(policy.premiumAmount).to.equal(premiumAmount);
  });

  it("rejects locks for an expired quote", async function () {
    const { insurance, farmer, quoteId, premiumAmount, expiresAt } = await loadFixture(
      registeredQuoteFixture
    );

    await time.increaseTo(Number(expiresAt) + 1);
    await expect(
      insurance.connect(farmer).lockPremiumForQuote(quoteId, { value: premiumAmount })
    ).to.be.revertedWithCustomError(insurance, "QuoteExpired");
  });

  it("allows capital lock and activation after quote expiry when premium was already locked", async function () {
    const {
      insurance,
      owner,
      farmer,
      underwriter,
      quoteId,
      premiumAmount,
      payoutAmount,
      expiresAt,
    } = await loadFixture(registeredQuoteFixture);

    await insurance.connect(farmer).lockPremiumForQuote(quoteId, { value: premiumAmount });
    await time.increaseTo(Number(expiresAt) + 1);

    await expect(insurance.connect(underwriter).lockCapitalForQuote(quoteId, payoutAmount))
      .to.emit(insurance, "QuoteCapitalLocked")
      .withArgs(quoteId, underwriter.address, payoutAmount);

    await expect(insurance.connect(owner).createPolicyFromQuote(quoteId))
      .to.emit(insurance, "QuoteTermsConverted")
      .withArgs(quoteId, 0);
  });
});
