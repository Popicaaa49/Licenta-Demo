import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337, // rețea implicită Hardhat
    },
    localhost: {
      url: "http://127.0.0.1:8545", // RPC local
      chainId: 31337,               // trebuie să se potrivească cu MetaMask
    },
  },
};

export default config;
