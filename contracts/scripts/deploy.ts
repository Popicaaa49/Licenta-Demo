import { ethers, artifacts } from "hardhat";
import fs from "fs";
import path from "path";

const FRONTEND_DIR = path.resolve(__dirname, "../../frontend/src");
const CONTRACTS_DIR = path.join(FRONTEND_DIR, "contracts");
const ADDRESSES_FILE = path.join(CONTRACTS_DIR, "contractAddress.json");
const ABI_FILE = path.join(CONTRACTS_DIR, "GameEscrow.json");

async function saveFrontendFiles(contractAddress: string, chainId: bigint) {
  if (!fs.existsSync(CONTRACTS_DIR)) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  const addresses: Record<string, string> = fs.existsSync(ADDRESSES_FILE)
    ? JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"))
    : {};

  const chainKey = chainId.toString();
  addresses[chainKey] = contractAddress;
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(addresses, null, 2));
  console.log(`Saved contract address for chain ${chainKey} to ${ADDRESSES_FILE}`);

  const artifact = await artifacts.readArtifact("GameEscrow");
  fs.writeFileSync(ABI_FILE, JSON.stringify(artifact, null, 2));
  console.log(`Saved ABI to ${ABI_FILE}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with account:", deployer.address);
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const GameEscrow = await ethers.getContractFactory("GameEscrow");
  const escrow = await GameEscrow.deploy();
  await escrow.waitForDeployment();

  const contractAddress = await escrow.getAddress();
  console.log("GameEscrow deployed to:", contractAddress);

  const network = await deployer.provider?.getNetwork();
  if (!network) {
    throw new Error("Unable to detect network. Is the provider running?");
  }
  await saveFrontendFiles(contractAddress, network.chainId);
}

// Good practice: handle async errors
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
