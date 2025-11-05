// ✅ CORECT
import hre from "hardhat";
import { expect } from "chai";
const { ethers } = hre;

describe("GameEscrow", function () {
  it("should allow two players to create and settle a match", async function () {
    const [admin, player1, player2] = await ethers.getSigners();
    const GameEscrow = await ethers.getContractFactory("GameEscrow");
    const escrow = await GameEscrow.deploy();
    await escrow.waitForDeployment();

    const tx = await escrow.connect(player1).createMatch(player2.address, {
      value: ethers.parseEther("0.1"),
    });
    await tx.wait();

    await escrow.connect(admin).settleMatch(0, player1.address);

    const matchData = await escrow.matches(0);
    expect(matchData.winner).to.equal(player1.address);
  });
});
