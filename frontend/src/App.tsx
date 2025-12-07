import React, { useEffect, useMemo, useState } from "react";
import WalletConnect from "./components/WalletConnect";
import GameInterface from "./components/GameInterface";
import MatchesList from "./components/MatchesList";
import MatchHistory from "./components/MatchHistory";
import AccountStats from "./components/AccountStats";
import { usePlayerHistory } from "./hooks/usePlayerHistory";
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
  const [statsOpen, setStatsOpen] = useState(false);

  const networkLabel = useMemo(() => resolveChainLabel(chainIdHex), [chainIdHex]);
  const { history, loading: historyLoading, error: historyError, stats } = usePlayerHistory(
    account,
    walletReady
  );

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

  useEffect(() => {
    if (!walletReady) {
      setStatsOpen(false);
    }
  }, [walletReady]);

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
          <div className="header-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setStatsOpen(true)}
              disabled={!walletReady}
            >
              Statistici
            </button>
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
                setStatsOpen(false);
              }}
            />
          </div>
        </header>

        <main className="app-main">
          <section className="panel panel--actions">
            <GameInterface walletConnected={walletReady} />
          </section>

          <section className="panel panel--matches">
            <MatchesList walletConnected={walletReady} account={account} />
          </section>

          <section className="panel panel--history">
            <MatchHistory
              walletConnected={walletReady}
              account={account}
              history={history}
              loading={historyLoading}
              error={historyError}
            />
          </section>
        </main>
      </div>

      {statsOpen && (
        <div className="stats-overlay" role="dialog" aria-modal="true">
          <div className="stats-modal">
            <div className="stats-modal-header">
              <div>
                <h3>Statistici cont</h3>
                <p>Analiza rezultatelor pentru adresa curenta.</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setStatsOpen(false)}>
                Inchide
              </button>
            </div>

            <AccountStats
              walletConnected={walletReady}
              account={account}
              loading={historyLoading}
              error={historyError}
              stats={stats}
              history={history}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
