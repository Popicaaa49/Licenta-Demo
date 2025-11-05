import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with account:", deployer.address);
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const GameEscrow = await ethers.getContractFactory("GameEscrow");
  const escrow = await GameEscrow.deploy();
  await escrow.waitForDeployment();

  console.log("GameEscrow deployed to:", await escrow.getAddress());
}

// Good practice: handle async errors
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
