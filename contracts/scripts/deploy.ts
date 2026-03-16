import { ethers, artifacts } from "hardhat";
import fs from "fs";
import path from "path";

const FRONTEND_DIR = path.resolve(__dirname, "../../frontend/src");
const CONTRACTS_DIR = path.join(FRONTEND_DIR, "contracts");
const GAME_ADDRESSES_FILE = path.join(CONTRACTS_DIR, "contractAddress.json");
const GAME_ABI_FILE = path.join(CONTRACTS_DIR, "GameEscrow.json");
const INSURANCE_ADDRESSES_FILE = path.join(CONTRACTS_DIR, "insuranceAddress.json");
const INSURANCE_ABI_FILE = path.join(CONTRACTS_DIR, "InsuranceEscrow.json");

type FrontendContractConfig = {
  addressFile: string;
  abiFile: string;
  contractName: string;
};

const FRONTEND_CONTRACTS: Record<string, FrontendContractConfig> = {
  GameEscrow: {
    addressFile: GAME_ADDRESSES_FILE,
    abiFile: GAME_ABI_FILE,
    contractName: "GameEscrow",
  },
  InsuranceEscrow: {
    addressFile: INSURANCE_ADDRESSES_FILE,
    abiFile: INSURANCE_ABI_FILE,
    contractName: "InsuranceEscrow",
  },
};

async function saveFrontendFiles(
  config: FrontendContractConfig,
  contractAddress: string,
  chainId: bigint
) {
  if (!fs.existsSync(CONTRACTS_DIR)) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  const addresses: Record<string, string> = fs.existsSync(config.addressFile)
    ? JSON.parse(fs.readFileSync(config.addressFile, "utf8"))
    : {};

  const chainKey = chainId.toString();
  addresses[chainKey] = contractAddress;
  fs.writeFileSync(config.addressFile, JSON.stringify(addresses, null, 2));
  console.log(`Saved contract address for chain ${chainKey} to ${config.addressFile}`);

  const artifact = await artifacts.readArtifact(config.contractName);
  fs.writeFileSync(config.abiFile, JSON.stringify(artifact, null, 2));
  console.log(`Saved ABI to ${config.abiFile}`);
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

  const InsuranceEscrow = await ethers.getContractFactory("InsuranceEscrow");
  const insurance = await InsuranceEscrow.deploy(deployer.address);
  await insurance.waitForDeployment();

  const insuranceAddress = await insurance.getAddress();
  console.log("InsuranceEscrow deployed to:", insuranceAddress);

  const network = await deployer.provider?.getNetwork();
  if (!network) {
    throw new Error("Unable to detect network. Is the provider running?");
  }
  await saveFrontendFiles(
    FRONTEND_CONTRACTS.GameEscrow,
    contractAddress,
    network.chainId
  );
  await saveFrontendFiles(
    FRONTEND_CONTRACTS.InsuranceEscrow,
    insuranceAddress,
    network.chainId
  );
}

// Good practice: handle async errors
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
