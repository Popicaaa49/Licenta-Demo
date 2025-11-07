import { ethers } from "ethers";
import GameEscrow from "./contracts/GameEscrow.json";
import addresses from "./contracts/contractAddress.json";

export const getContract = async () => {
  if (!window.ethereum) throw new Error("MetaMask not detected");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();

  const addressBook = addresses as Record<string, string>;
  const chainKey = network.chainId.toString();
  const contractAddress = addressBook[chainKey];

  if (!contractAddress) {
    throw new Error(
      `Contract address not found for chain ${chainKey}. Deploy GameEscrow and rerun the frontend.`
    );
  }

  const contract = new ethers.Contract(contractAddress, GameEscrow.abi, signer);
  return { contract, signer, provider };
};
