import React, { useEffect, useMemo, useState } from "react";
import { getReadInsuranceContract } from "../web3Config";
import { InsuranceRequest, PolicyState } from "../types/insurance";

interface InsuranceOverviewProps {
  walletConnected: boolean;
  account: string | null;
  onNavigate: (tab: "request" | "marketplace" | "policies") => void;
}

const BACKEND_BASE_URL =
  process.env.REACT_APP_BACKEND_URL?.trim() || "http://127.0.0.1:4000";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value < 1000 ? 2 : 0,
  }).format(value);

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(address.length - 4)}`;

const getRequestStatusLabel = (status: string) => {
  switch (status) {
    case "quoted":
      return "Ofertata";
    case "awaiting_farmer_lock":
      return "Asteapta premium initial";
    case "awaiting_underwriter":
      return "In marketplace";
    case "awaiting_premium":
      return "Asteapta premium";
    case "ready_for_activation":
      return "Gata de activare";
    case "activated":
      return "Activata";
    default:
      return status;
  }
};

type OverviewState = {
  activePolicies: number;
  marketplaceRequests: number;
  lockedQuotes: number;
  readyRequests: number;
  requestError: string | null;
  ownerAddress: string | null;
  oracleAddress: string | null;
  recentRequests: InsuranceRequest[];
};

const initialOverviewState: OverviewState = {
  activePolicies: 0,
  marketplaceRequests: 0,
  lockedQuotes: 0,
  readyRequests: 0,
  requestError: null,
  ownerAddress: null,
  oracleAddress: null,
  recentRequests: [],
};

const InsuranceOverview: React.FC<InsuranceOverviewProps> = ({
  walletConnected,
  account,
  onNavigate,
}) => {
  const [overview, setOverview] = useState<OverviewState>(initialOverviewState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletConnected) {
      setOverview(initialOverviewState);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadOverview = async () => {
      try {
        setLoading(true);
        const { contract } = await getReadInsuranceContract();
        const [policies, owner, oracle, requestResponse] = await Promise.all([
          contract.getPolicies(),
          contract.owner(),
          contract.oracle(),
          fetch(`${BACKEND_BASE_URL}/insurance-request`),
        ]);

        const requestPayload = requestResponse.ok
          ? ((await requestResponse.json()) as InsuranceRequest[])
          : [];
        const requestError = requestResponse.ok
          ? null
          : "Nu am putut incarca cererile din backend.";

        if (!isMounted) {
          return;
        }

        setOverview({
          activePolicies: policies.filter((policy: { state?: number }) => Number(policy.state) === PolicyState.Active).length,
          marketplaceRequests: requestPayload.filter((request) =>
            ["awaiting_underwriter", "awaiting_premium", "ready_for_activation"].includes(
              request.status
            )
          ).length,
          lockedQuotes: requestPayload.filter(
            (request) => request.latestQuote?.status === "locked"
          ).length,
          readyRequests: requestPayload.filter(
            (request) => request.status === "ready_for_activation"
          ).length,
          requestError,
          ownerAddress: owner,
          oracleAddress: oracle,
          recentRequests: [...requestPayload]
            .sort((left, right) => right.id - left.id)
            .slice(0, 4),
        });
      } catch (error) {
        console.warn("Unable to load insurance overview", error);
        if (isMounted) {
          setOverview(initialOverviewState);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadOverview();

    return () => {
      isMounted = false;
    };
  }, [walletConnected]);

  const heroTitle = useMemo(() => {
    if (!account) {
      return "Insurance workspace";
    }

    return `Bine ai revenit, ${shortAddress(account)}`;
  }, [account]);

  return (
    <div className="insurance-overview">
      <section className="panel insurance-hero">
        <div className="insurance-hero__content">
          <span className="insurance-hero__eyebrow">Parametric Crop Cover</span>
          <h2>{heroTitle}</h2>
          <p>
            Gestionezi cereri, capital de risc si polite parametrice dintr-un flux
            separat de playground-ul on-chain.
          </p>
          <div className="insurance-hero__actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => onNavigate("request")}
            >
              Solicita acoperire
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate("marketplace")}
            >
              Marketplace
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate("policies")}
            >
              Polite
            </button>
          </div>
        </div>
        <div className="insurance-hero__meta">
          <div className="insurance-summary-card">
            <span>Flux activ</span>
            <strong>Premium lock si capital lock</strong>
          </div>
          <div className="insurance-summary-card">
            <span>Owner</span>
            <strong>{overview.ownerAddress ? shortAddress(overview.ownerAddress) : "-"}</strong>
          </div>
          <div className="insurance-summary-card">
            <span>Oracle</span>
            <strong>{overview.oracleAddress ? shortAddress(overview.oracleAddress) : "-"}</strong>
          </div>
        </div>
      </section>

      <div className="insurance-overview__grid">
        <section className="panel insurance-overview-panel">
          <div className="panel-header">
            <h3>Snapshot operational</h3>
            <p>Un rezumat rapid al starii curente din contract si backend.</p>
          </div>
          {loading ? (
            <div className="skeleton">Se incarca sumarul...</div>
          ) : (
            <div className="insurance-summary-grid">
              <div className="insurance-summary-card insurance-summary-card--metric">
                <span>Polite active</span>
                <strong>{overview.activePolicies}</strong>
              </div>
              <div className="insurance-summary-card insurance-summary-card--metric">
                <span>Cereri in marketplace</span>
                <strong>{overview.marketplaceRequests}</strong>
              </div>
              <div className="insurance-summary-card insurance-summary-card--metric">
                <span>Capital lock activ</span>
                <strong>{overview.lockedQuotes}</strong>
              </div>
              <div className="insurance-summary-card insurance-summary-card--metric">
                <span>Gata de activare</span>
                <strong>{overview.readyRequests}</strong>
              </div>
            </div>
          )}
        </section>

        <section className="panel insurance-overview-panel">
          <div className="panel-header">
            <h3>Cereri recente</h3>
            <p>Ultimele cereri create, inclusiv cele care asteapta lock-ul initial al premium-ului.</p>
          </div>
          {loading ? (
            <div className="skeleton">Se incarca cererile...</div>
          ) : overview.recentRequests.length === 0 ? (
            overview.requestError ? (
              <div className="empty-state">
                <h3>Nu am putut incarca cererile</h3>
                <p>{overview.requestError}</p>
              </div>
            ) : (
            <div className="empty-state">
              <h3>Nu exista cereri</h3>
              <p>Trimite prima cerere pentru a porni marketplace-ul.</p>
            </div>
            )
          ) : (
            <div className="insurance-request-list">
              {overview.recentRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className="insurance-request-card"
                  onClick={() => onNavigate("marketplace")}
                >
                  <div>
                    <strong>{request.locationLabel}</strong>
                    <small>
                      {request.cropType} - {request.areaHa.toFixed(2)} ha
                    </small>
                  </div>
                  <div className="insurance-request-card__meta">
                    <span>{request.latestQuote ? formatCurrency(request.latestQuote.payoutCapEur) : "fara oferta"}</span>
                    <small>{getRequestStatusLabel(request.status)}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default InsuranceOverview;
