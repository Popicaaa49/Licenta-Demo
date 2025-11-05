import { Eip1193Provider } from "ethers";

export {};

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] | Record<string, any> }) => Promise<any>;
    };
  }
}
