import { ethers } from "ethers";
import GameEscrow from "./contracts/GameEscrow.json";
import InsuranceEscrow from "./contracts/InsuranceEscrow.json";
import gameAddresses from "./contracts/contractAddress.json";
import insuranceAddresses from "./contracts/insuranceAddress.json";

const DEFAULT_READ_RPC_URL = "http://127.0.0.1:8545";
const rawReadRpcUrl = process.env.REACT_APP_READ_RPC_URL;
const READ_RPC_URL =
  rawReadRpcUrl && rawReadRpcUrl.trim().length > 0
    ? rawReadRpcUrl.trim()
    : DEFAULT_READ_RPC_URL;

let readProvider: ethers.JsonRpcProvider | null = null;

const getWeb3Context = async () => {
  if (!window.ethereum) throw new Error("MetaMask not detected");

  const provider = new ethers.BrowserProvider(window.ethereum);
  provider.pollingInterval = 500;
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();

  return { provider, signer, network };
};

const resolveContractAddress = (
  addressBook: Record<string, string>,
  chainId: bigint,
  contractName: string
) => {
  const chainKey = chainId.toString();
  const contractAddress = addressBook[chainKey];

  if (!contractAddress) {
    throw new Error(
      `Contract address not found for chain ${chainKey}. Deploy ${contractName} and rerun the frontend.`
    );
  }

  return contractAddress;
};

const getReadProvider = async () => {
  if (!readProvider) {
    readProvider = new ethers.JsonRpcProvider(READ_RPC_URL);
    readProvider.pollingInterval = 400;
  }

  try {
    await readProvider.getBlockNumber();
    return readProvider;
  } catch (err) {
    console.warn("Read provider unavailable, falling back to wallet", err);
    return null;
  }
};

export const getContract = async () => {
  const { provider, signer, network } = await getWeb3Context();
  const addressBook = gameAddresses as Record<string, string>;
  const contractAddress = resolveContractAddress(
    addressBook,
    network.chainId,
    "GameEscrow"
  );

  const contract = new ethers.Contract(contractAddress, GameEscrow.abi, signer);
  return { contract, signer, provider };
};

export const getReadGameContract = async () => {
  const addressBook = gameAddresses as Record<string, string>;
  const provider = await getReadProvider();

  if (provider) {
    const network = await provider.getNetwork();
    const contractAddress = resolveContractAddress(
      addressBook,
      network.chainId,
      "GameEscrow"
    );
    const contract = new ethers.Contract(contractAddress, GameEscrow.abi, provider);
    return { contract, provider };
  }

  const { provider: walletProvider, network } = await getWeb3Context();
  const contractAddress = resolveContractAddress(
    addressBook,
    network.chainId,
    "GameEscrow"
  );
  const contract = new ethers.Contract(
    contractAddress,
    GameEscrow.abi,
    walletProvider
  );
  return { contract, provider: walletProvider };
};

export const getInsuranceContract = async () => {
  const { provider, signer, network } = await getWeb3Context();
  const addressBook = insuranceAddresses as Record<string, string>;
  const contractAddress = resolveContractAddress(
    addressBook,
    network.chainId,
    "InsuranceEscrow"
  );

  const contract = new ethers.Contract(
    contractAddress,
    InsuranceEscrow.abi,
    signer
  );
  return { contract, signer, provider };
};
