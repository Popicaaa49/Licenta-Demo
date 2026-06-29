import React, { useEffect, useMemo, useRef, useState } from "react";
import WalletConnect from "./components/WalletConnect";
import NotificationBell from "./components/NotificationBell";
import GameInterface from "./components/GameInterface";
import MatchesList from "./components/MatchesList";
import MatchHistory from "./components/MatchHistory";
import AccountStats from "./components/AccountStats";
import InsuranceWorkspace, {
  InsuranceTab,
  insuranceTabs,
} from "./components/InsuranceWorkspace";
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
  const [activeModule, setActiveModule] = useState<"insurance" | "playground">("insurance");
  const [activeInsuranceTab, setActiveInsuranceTab] =
    useState<InsuranceTab>("overview");
  const [activePlaygroundTab, setActivePlaygroundTab] = useState<
    "game" | "matches" | "history" | "stats"
  >("game");

  const playgroundActionsRef = useRef<HTMLElement | null>(null);
  const playgroundMatchesRef = useRef<HTMLElement | null>(null);
  const playgroundHistoryRef = useRef<HTMLElement | null>(null);

  const networkLabel = useMemo(() => resolveChainLabel(chainIdHex), [chainIdHex]);
  const moduleMeta = useMemo(
    () =>
      activeModule === "insurance"
        ? {
            title: "Parametric Crop Cover",
            subtitle:
              "Marketplace de asigurare agricola parametrică cu underwriting, capital blocat si payout on-chain.",
          }
        : {
            title: "Playground",
            subtitle:
              "Experimente on-chain separate de produsul principal, inclusiv demo-ul Tic-Tac-Toe.",
          },
    [activeModule]
  );
  const { history, loading: historyLoading, error: historyError, stats } = usePlayerHistory(
    account,
    walletReady
  );

  const sidebarNavItems = useMemo(() => {
    if (activeModule === "insurance") {
      return insuranceTabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        description: tab.description,
        active: activeInsuranceTab === tab.id,
      }));
    }

    return [
      {
        id: "game",
        label: "Joc",
        description: "Masa activa pentru Tic-Tac-Toe on-chain.",
        active: activePlaygroundTab === "game",
      },
      {
        id: "matches",
        label: "Meciuri",
        description: "Partidele live care asteapta sau ruleaza acum.",
        active: activePlaygroundTab === "matches",
      },
      {
        id: "history",
        label: "Istoric",
        description: "Rundele incheiate si miscarile recente.",
        active: activePlaygroundTab === "history",
      },
      {
        id: "stats",
        label: "Statistici",
        description: "Rezumatul performantelor pentru contul conectat.",
        active: activePlaygroundTab === "stats",
      },
    ];
  }, [activeInsuranceTab, activeModule, activePlaygroundTab]);

  const handlePlaygroundNavigation = (
    target: "game" | "matches" | "history" | "stats"
  ) => {
    setActiveModule("playground");
    setActivePlaygroundTab(target);

    if (target === "stats") {
      setStatsOpen(true);
      return;
    }

    const targetRef =
      target === "game"
        ? playgroundActionsRef
        : target === "matches"
        ? playgroundMatchesRef
        : playgroundHistoryRef;

    window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

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
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <div>
            <div className="app-sidebar__brand-title">CropCover</div>
            <div className="app-sidebar__brand-subtitle">workspace</div>
          </div>
        </div>

        <div className="app-sidebar__switch" role="tablist" aria-label="Workspace">
          <button
            type="button"
            className={`app-sidebar__switch-button ${
              activeModule === "insurance" ? "app-sidebar__switch-button--active" : ""
            }`}
            onClick={() => setActiveModule("insurance")}
            aria-pressed={activeModule === "insurance"}
          >
            Contracte
          </button>
          <button
            type="button"
            className={`app-sidebar__switch-button ${
              activeModule === "playground" ? "app-sidebar__switch-button--active" : ""
            }`}
            onClick={() => setActiveModule("playground")}
            aria-pressed={activeModule === "playground"}
          >
            Playground
          </button>
        </div>

        <div className="app-sidebar__group">
          <span className="app-sidebar__group-label">
            {activeModule === "insurance" ? "Contracte" : "Playground"}
          </span>
          <nav className="app-sidebar__nav" aria-label="Primary">
            {sidebarNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`app-sidebar__link ${
                  item.active ? "app-sidebar__link--active" : ""
                }`}
                onClick={() => {
                  if (activeModule === "insurance") {
                    setActiveModule("insurance");
                    setActiveInsuranceTab(item.id as InsuranceTab);
                  } else {
                    handlePlaygroundNavigation(
                      item.id as "game" | "matches" | "history" | "stats"
                    );
                  }
                }}
                aria-pressed={item.active}
              >
                <span className="app-sidebar__link-copy">
                  <span className="app-sidebar__link-title">{item.label}</span>
                  <span className="app-sidebar__link-desc">{item.description}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="app-sidebar__group app-sidebar__group--account">
          <span className="app-sidebar__group-label">Account</span>
          <div className="app-sidebar__account-card">
            <span className="app-sidebar__account-label">Wallet</span>
            <strong>{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Neconectat"}</strong>
            <span className="app-sidebar__account-meta">
              {networkLabel || "Alege o retea"}
            </span>
          </div>
        </div>
      </aside>

      <div className="app-content">
        <div
          className={`app-container ${
            activeModule === "insurance"
              ? "app-container--insurance"
              : "app-container--playground"
          }`}
        >
          <header className="app-header">
            <div className="app-title-group">
              <h1 className="app-title">{moduleMeta.title}</h1>
              <p className="app-subtitle">{moduleMeta.subtitle}</p>
            </div>
            <div className="header-actions">
              {activeModule === "playground" ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setActivePlaygroundTab("stats");
                    setStatsOpen(true);
                  }}
                  disabled={!walletReady}
                >
                  Statistici
                </button>
              ) : null}
              {activeModule === "insurance" ? (
                <NotificationBell
                  account={account}
                  walletConnected={walletReady}
                  onNavigateToEntity={(notification) => {
                    setActiveModule("insurance");
                    setActiveInsuranceTab(
                      notification.entityType === "policy" ? "policies" : "marketplace"
                    );
                  }}
                />
              ) : null}
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

          <main
            className={`app-main ${
              activeModule === "insurance" ? "app-main--single" : "app-main--playground"
            }`}
          >
            {activeModule === "playground" ? (
              <>
                <section ref={playgroundActionsRef} className="panel panel--actions">
                  <GameInterface walletConnected={walletReady} />
                </section>

                <section ref={playgroundMatchesRef} className="panel panel--matches">
                  <MatchesList walletConnected={walletReady} account={account} />
                </section>

                <section ref={playgroundHistoryRef} className="panel panel--history">
                  <MatchHistory
                    walletConnected={walletReady}
                    account={account}
                    history={history}
                    loading={historyLoading}
                    error={historyError}
                  />
                </section>
              </>
            ) : (
              <InsuranceWorkspace
                walletConnected={walletReady}
                account={account}
                activeTab={activeInsuranceTab}
                onTabChange={setActiveInsuranceTab}
              />
            )}
          </main>
        </div>
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
