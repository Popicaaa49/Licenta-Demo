import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("GameEscrow TicTacToe", function () {
  async function deployFixture() {
    const [player1, player2, outsider] = await ethers.getSigners();
    const GameEscrow = await ethers.getContractFactory("GameEscrow");
    const escrow = await GameEscrow.deploy();
    await escrow.waitForDeployment();

    return { escrow, player1, player2, outsider };
  }

  const bet = ethers.parseEther("0.1");

  it("creates a match, accepts an opponent, and starts the game", async function () {
    const { escrow, player1, player2 } = await loadFixture(deployFixture);

    await expect(
      escrow.connect(player1).createMatch({ value: bet })
    ).to.emit(escrow, "MatchCreated");

    const created = await escrow.getMatch(0);
    expect(created.player1).to.equal(player1.address);
    expect(created.player2).to.equal(ethers.ZeroAddress);
    expect(created.betAmount).to.equal(bet);
    expect(created.state).to.equal(0);

    await expect(
      escrow.connect(player2).joinMatch(0, { value: bet })
    )
      .to.emit(escrow, "MatchJoined")
      .withArgs(0, player2.address)
      .and.to.emit(escrow, "MatchStarted");

    const joined = await escrow.getMatch(0);
    expect(joined.player2).to.equal(player2.address);
    expect(joined.state).to.equal(1);
    expect(joined.currentTurn).to.equal(player1.address);
  });

  it("lets player1 win and pays the entire pot", async function () {
    const { escrow, player1, player2 } = await loadFixture(deployFixture);

    await escrow.connect(player1).createMatch({ value: bet });
    await escrow.connect(player2).joinMatch(0, { value: bet });

    expect(await ethers.provider.getBalance(escrow.target)).to.equal(bet * 2n);

    await escrow.connect(player1).makeMove(0, 0);
    await escrow.connect(player2).makeMove(0, 1);
    await escrow.connect(player1).makeMove(0, 4);
    await escrow.connect(player2).makeMove(0, 2);
    const finishingTx = await escrow.connect(player1).makeMove(0, 8);

    await expect(finishingTx)
      .to.emit(escrow, "MatchFinished")
      .withArgs(0, player1.address, false, bet * 2n);

    const finished = await escrow.getMatch(0);
    expect(finished.state).to.equal(2);
    expect(finished.winner).to.equal(player1.address);
    expect(finished.betAmount).to.equal(bet);
    expect(finished.currentTurn).to.equal(ethers.ZeroAddress);
    expect(await ethers.provider.getBalance(escrow.target)).to.equal(0n);
  });

  it("handles a draw and refunds both players", async function () {
    const { escrow, player1, player2 } = await loadFixture(deployFixture);

    await escrow.connect(player1).createMatch({ value: bet });
    await escrow.connect(player2).joinMatch(0, { value: bet });

    const contractAddress = escrow.target;

    const sequence = [
      { player: player1, cell: 0 },
      { player: player2, cell: 4 },
      { player: player1, cell: 2 },
      { player: player2, cell: 6 },
      { player: player1, cell: 7 },
      { player: player2, cell: 1 },
      { player: player1, cell: 5 },
      { player: player2, cell: 8 },
      { player: player1, cell: 3 },
    ];

    for (const move of sequence) {
      await escrow.connect(move.player).makeMove(0, move.cell);
    }

    const matchData = await escrow.getMatch(0);
    expect(matchData.state).to.equal(2);
    expect(matchData.winner).to.equal(ethers.ZeroAddress);
    expect(matchData.betAmount).to.equal(bet);
    expect(await ethers.provider.getBalance(contractAddress)).to.equal(0n);
  });

  it("enforces turn order, bet amount, and move validity", async function () {
    const { escrow, player1, player2, outsider } = await loadFixture(deployFixture);

    await expect(escrow.connect(player1).createMatch({ value: 0n })).to.be.revertedWithCustomError(
      escrow,
      "InvalidBet"
    );

    await escrow.connect(player1).createMatch({ value: bet });

    await expect(
      escrow.connect(player1).joinMatch(0, { value: bet })
    ).to.be.revertedWithCustomError(escrow, "CreatorCannotJoin");

    await expect(
      escrow.connect(player2).joinMatch(0, { value: bet / 2n })
    ).to.be.revertedWithCustomError(escrow, "IncorrectBetAmount");

    await escrow.connect(player2).joinMatch(0, { value: bet });

    await expect(
      escrow.connect(outsider).makeMove(0, 0)
    ).to.be.revertedWithCustomError(escrow, "NotParticipant");

    await escrow.connect(player1).makeMove(0, 0);

    await expect(
      escrow.connect(player1).makeMove(0, 1)
    ).to.be.revertedWithCustomError(escrow, "NotPlayerTurn");

    await expect(
      escrow.connect(player2).makeMove(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidMove");

    await escrow.connect(player2).makeMove(0, 4);

    await expect(
      escrow.connect(player1).makeMove(0, 9)
    ).to.be.revertedWithCustomError(escrow, "InvalidMove");
  });

  it("tracks match history per address", async function () {
    const { escrow, player1, player2, outsider } = await loadFixture(deployFixture);

    await escrow.connect(player1).createMatch({ value: bet });
    await escrow.connect(player2).joinMatch(0, { value: bet });

    await escrow.connect(player1).makeMove(0, 0);
    await escrow.connect(player2).makeMove(0, 1);
    await escrow.connect(player1).makeMove(0, 4);
    await escrow.connect(player2).makeMove(0, 3);
    await escrow.connect(player1).makeMove(0, 8);

    await escrow.connect(player1).createMatch({ value: bet });
    await escrow.connect(outsider).joinMatch(1, { value: bet });

    const player1Ids = await escrow.getPlayerMatchIds(player1.address);
    const player2Ids = await escrow.getPlayerMatchIds(player2.address);
    const outsiderIds = await escrow.getPlayerMatchIds(outsider.address);

    expect(player1Ids).to.deep.equal([0n, 1n]);
    expect(player2Ids).to.deep.equal([0n]);
    expect(outsiderIds).to.deep.equal([1n]);

    const [player1History, player1HistoryIds] = await escrow.getPlayerHistory(player1.address);
    expect(player1History.length).to.equal(2);
    expect(player1HistoryIds).to.deep.equal([0n, 1n]);
    expect(player1History[0].player2).to.equal(player2.address);
    expect(player1History[0].state).to.equal(2);
    expect(player1History[1].player2).to.equal(outsider.address);
    expect(player1History[1].state).to.equal(1);
  });

  it("initializes and updates Elo ratings after every match result", async function () {
    const { escrow, player1, player2 } = await loadFixture(deployFixture);

    expect(await escrow.getPlayerElo(player1.address)).to.equal(1000n);
    expect(await escrow.getPlayerElo(player2.address)).to.equal(1000n);

    await escrow.connect(player1).createMatch({ value: bet });
    await escrow.connect(player2).joinMatch(0, { value: bet });

    await escrow.connect(player1).makeMove(0, 0);
    await escrow.connect(player2).makeMove(0, 1);
    await escrow.connect(player1).makeMove(0, 4);
    await escrow.connect(player2).makeMove(0, 2);
    await escrow.connect(player1).makeMove(0, 8);

    expect(await escrow.getPlayerElo(player1.address)).to.equal(1025n);
    expect(await escrow.getPlayerElo(player2.address)).to.equal(975n);

    await escrow.connect(player1).createMatch({ value: bet });
    await escrow.connect(player2).joinMatch(1, { value: bet });

    const drawSequence = [
      { player: player1, cell: 0 },
      { player: player2, cell: 4 },
      { player: player1, cell: 2 },
      { player: player2, cell: 6 },
      { player: player1, cell: 7 },
      { player: player2, cell: 1 },
      { player: player1, cell: 5 },
      { player: player2, cell: 8 },
      { player: player1, cell: 3 },
    ];

    for (const move of drawSequence) {
      await escrow.connect(move.player).makeMove(1, move.cell);
    }

    expect(await escrow.getPlayerElo(player1.address)).to.equal(1025n);
    expect(await escrow.getPlayerElo(player2.address)).to.equal(975n);
  });
});
