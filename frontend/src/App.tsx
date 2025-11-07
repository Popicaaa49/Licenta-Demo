import React, { useEffect, useMemo, useState } from "react";
import WalletConnect from "./components/WalletConnect";
import GameInterface from "./components/GameInterface";
import MatchesList from "./components/MatchesList";
import "./App.css";

const resolveChainLabel = (chainIdHex?: string | null) => {
  if (!chainIdHex) return "";
  const normalized = parseInt(chainIdHex, 16);
  if (Number.isNaN(normalized)) {
    return `Chain ${chainIdHex}`;
  }

  switch (normalized) {
    case 31337:
      return "Hardhat Localhost";
    case 1:
      return "Ethereum Mainnet";
    case 5:
      return "Goerli";
    default:
      return `Chain ${normalized}`;
  }
};

const App: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string>("");
  const [walletReady, setWalletReady] = useState(false);

  const networkLabel = useMemo(() => resolveChainLabel(chainIdHex), [chainIdHex]);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        setWalletReady(true);
      } else {
        setAccount(null);
        setWalletReady(false);
      }
    };

    const handleChainChanged = (newChainId: string) => {
      setChainIdHex(newChainId);
    };

    ethereum.on?.("accountsChanged", handleAccountsChanged);
    ethereum.on?.("chainChanged", handleChainChanged);

    (async () => {
      try {
        const existingAccounts = (await ethereum.request({
          method: "eth_accounts",
        })) as string[];
        handleAccountsChanged(existingAccounts);
      } catch (accountsError) {
        console.warn("Unable to read wallet accounts", accountsError);
      }

      try {
        const chainId = (await ethereum.request({
          method: "eth_chainId",
        })) as string;
        setChainIdHex(chainId);
      } catch (chainError) {
        console.warn("Unable to read chain id", chainError);
      }
    })();

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <div className="app-title-group">
            <h1 className="app-title">Aici voi pune titlul licentei</h1>
            <p className="app-subtitle">
              Demo Licenta in continua actualizare
            </p>
          </div>
          <WalletConnect
            account={account}
            networkLabel={networkLabel}
            onConnect={(connectedAccount, detectedChain) => {
              setAccount(connectedAccount);
              setWalletReady(true);
              if (detectedChain) {
                setChainIdHex(detectedChain);
              }
            }}
            onDisconnect={() => {
              setAccount(null);
              setWalletReady(false);
              setChainIdHex("");
            }}
          />
        </header>

        <main className="app-main">
          <section className="panel panel--actions">
            <GameInterface walletConnected={walletReady} />
          </section>

          <section className="panel panel--matches">
            <MatchesList walletConnected={walletReady} account={account} />
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
