import { ethers } from "ethers";
import GameEscrow from "./contracts/GameEscrow.json";

const contractAddress = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"; // va fi completat după deploy

export const getContract = async () => {
  if (!window.ethereum) throw new Error("MetaMask not detected");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const contract = new ethers.Contract(contractAddress, GameEscrow.abi, signer);
  return { contract, signer, provider };
};
