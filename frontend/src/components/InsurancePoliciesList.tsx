import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useRiskStream } from "../hooks/useRiskStream";
import { getInsuranceContract, getReadInsuranceContract } from "../web3Config";
import {
  Policy,
  PolicyLocationMetadata,
  POLICY_STATE_LABELS,
  PolicyState,
  RiskSnapshot,
} from "../types/insurance";

type StatusPayload = { type: "success" | "error" | "warning"; message: string };

type PolicyRiskSummary = {
  locationId: string;
  latestSnapshot: RiskSnapshot;
  latestWeather?: Record<string, unknown> | null;
  latestEvent?: Record<string, unknown> | null;
  assessment?: {
    season: string;
    riskScore: number;
    payoutTriggered: boolean;
    matchedRules: string[];
    explanation: string[];
    thresholds: {
      thresholdScore: number;
      emergencyRain24h: number;
    };
  } | null;
};

interface InsurancePoliciesListProps {
  walletConnected: boolean;
  account: string | null;
}

const BACKEND_BASE_URL =
  process.env.REACT_APP_BACKEND_URL?.trim() || "http://127.0.0.1:4000";

const SNAPSHOT_STALE_MS = 90 * 60 * 1000;

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(address.length - 4)}`;

const formatDateTime = (value: number | string | null | undefined) => {
  if (!value) return "-";

  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString();
};

const formatCoordinate = (value: number | null | undefined) =>
  typeof value === "number" ? value.toFixed(5) : "-";

const formatNumber = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" ? value.toFixed(digits) : "-";

const formatRuleLabel = (rule: string) =>
  rule
    .replace(/^spring_/, "spring ")
    .replace(/_/g, " ")
    .replace(/\bgt\b/g, ">")
    .replace(/\blt\b/g, "<");

const buildGoogleMapsUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps?q=${latitude},${longitude}`;

const buildOpenStreetMapUrl = (latitude: number, longitude: number) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const InsurancePoliciesList: React.FC<InsurancePoliciesListProps> = ({
  walletConnected,
  account,
}) => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<StatusPayload | null>(null);
  const [pendingAction, setPendingAction] = useState<number | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<PolicyRiskSummary | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<RiskSnapshot[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const isOwner = useMemo(() => {
    if (!account || !ownerAddress) return false;
    return account.toLowerCase() === ownerAddress.toLowerCase();
  }, [account, ownerAddress]);

  const locationIds = useMemo(
    () => policies.map((policy) => policy.locationId),
    [policies]
  );

  const riskFeed = useRiskStream(locationIds, walletConnected && policies.length > 0);

  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.id === selectedPolicyId) ?? null,
    [policies, selectedPolicyId]
  );

  const fetchPolicies = useCallback(async () => {
    if (!walletConnected) {
      setPolicies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { contract } = await getReadInsuranceContract();
      const [data, owner, metadataResponse] = await Promise.all([
        contract.getPolicies(),
        contract.owner(),
        fetch(`${BACKEND_BASE_URL}/contract`),
      ]);

      let metadataById: Record<number, PolicyLocationMetadata> = {};
      if (metadataResponse.ok) {
        const metadataPayload = (await metadataResponse.json()) as Array<{
          id: string;
          location_id: string;
          location_label: string | null;
          latitude: string | number | null;
          longitude: string | number | null;
        }>;

        metadataById = Object.fromEntries(
          metadataPayload.map((item) => [
            Number(item.id),
            {
              id: Number(item.id),
              locationId: item.location_id,
              locationLabel: item.location_label,
              latitude:
                item.latitude === null || item.latitude === undefined
                  ? null
                  : Number(item.latitude),
              longitude:
                item.longitude === null || item.longitude === undefined
                  ? null
                  : Number(item.longitude),
            },
          ])
        );
      }

      const formatted: Policy[] = data.map((p: any, i: number) => {
        const payoutWei = BigInt(p.payoutAmount?.toString?.() ?? "0");
        const metadata = metadataById[i];

        return {
          id: i,
          user: p.user,
          locationId: p.locationId,
          locationLabel: metadata?.locationLabel ?? null,
          latitude: metadata?.latitude ?? null,
          longitude: metadata?.longitude ?? null,
          cropType: p.cropType,
          thresholdScore: Number(p.thresholdScore ?? 0),
          emergencyRain24h: Number(p.emergencyRain24h ?? 0),
          payoutWei,
          payoutEth: ethers.formatEther(payoutWei),
          startTime: Number(p.startTime ?? 0),
          endTime: Number(p.endTime ?? 0),
          lastOracleUpdateAt: Number(p.lastOracleUpdateAt ?? 0),
          lastRiskScore: Number(p.lastRiskScore ?? 0),
          payoutTriggered: Boolean(p.payoutTriggered),
          state: Number(p.state) as PolicyState,
        };
      });

      setPolicies(formatted);
      setOwnerAddress(owner);
    } catch (err) {
      console.error("Error fetching policies:", err);
      setActionMessage({
        type: "error",
        message: "Nu am putut incarca politele. Verifica conexiunea la retea.",
      });
    } finally {
      setLoading(false);
    }
  }, [walletConnected]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  useEffect(() => {
    if (policies.length === 0) {
      setSelectedPolicyId(null);
      return;
    }

    setSelectedPolicyId((current) =>
      current !== null && policies.some((policy) => policy.id === current)
        ? current
        : policies[0].id
    );
  }, [policies]);

  useEffect(() => {
    if (!selectedPolicy) {
      setSelectedSummary(null);
      setSelectedHistory([]);
      return;
    }

    const controller = new AbortController();
    const loadSelectedPolicy = async () => {
      setDetailLoading(true);

      try {
        const [summaryResponse, historyResponse] = await Promise.all([
          fetch(`${BACKEND_BASE_URL}/risk/${selectedPolicy.locationId}`, {
            signal: controller.signal,
          }),
          fetch(`${BACKEND_BASE_URL}/risk/history/${selectedPolicy.locationId}?limit=8`, {
            signal: controller.signal,
          }),
        ]);

        if (!historyResponse.ok) {
          throw new Error(`History request failed with ${historyResponse.status}`);
        }

        const historyPayload = (await historyResponse.json()) as RiskSnapshot[];
        if (controller.signal.aborted) {
          return;
        }

        setSelectedHistory(historyPayload);

        if (summaryResponse.ok) {
          const summaryPayload = (await summaryResponse.json()) as PolicyRiskSummary;
          if (controller.signal.aborted) {
            return;
          }

          setSelectedSummary(summaryPayload);
          return;
        }

        if (summaryResponse.status === 404) {
          setSelectedSummary(null);
          return;
        }

        throw new Error(`Summary request failed with ${summaryResponse.status}`);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Unable to load policy detail", error);
        setSelectedSummary(null);
        setSelectedHistory([]);
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    };

    void loadSelectedPolicy();

    return () => controller.abort();
  }, [selectedPolicy]);

  useEffect(() => {
    if (!walletConnected) return;

    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { contract } = await getInsuranceContract();

        const refresh = (label: string) => {
          if (isMounted) {
            console.log(`${label} event detected -> refreshing list`);
            fetchPolicies();
          }
        };

        const onCreated = () => refresh("PolicyCreated");
        const onPayout = () => refresh("PolicyPaidOut");
        const onExpired = () => refresh("PolicyExpired");
        const onCancelled = () => refresh("PolicyCancelled");

        contract.on("PolicyCreated", onCreated);
        contract.on("PolicyPaidOut", onPayout);
        contract.on("PolicyExpired", onExpired);
        contract.on("PolicyCancelled", onCancelled);

        cleanup = () => {
          contract.off("PolicyCreated", onCreated);
          contract.off("PolicyPaidOut", onPayout);
          contract.off("PolicyExpired", onExpired);
          contract.off("PolicyCancelled", onCancelled);
        };
      } catch (listenerError) {
        console.warn("Unable to attach policy listeners", listenerError);
      }
    };

    void setupListeners();

    const refreshListener = () => isMounted && fetchPolicies();
    window.addEventListener("policies:refresh", refreshListener);

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
      window.removeEventListener("policies:refresh", refreshListener);
    };
  }, [walletConnected, fetchPolicies]);

  const handleCancel = async (policy: Policy) => {
    try {
      setPendingAction(policy.id);
      setActionMessage(null);
      const { contract } = await getInsuranceContract();
      const tx = await contract.cancelPolicy(policy.id, {
        gasLimit: 200_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Polita #${policy.id} a fost anulata.`,
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tranzactia a esuat.";
      setActionMessage({ type: "error", message });
    } finally {
      setPendingAction(null);
    }
  };

  const handleExpire = async (policy: Policy) => {
    try {
      setPendingAction(policy.id);
      setActionMessage(null);
      const { contract } = await getInsuranceContract();
      const tx = await contract.expirePolicy(policy.id, {
        gasLimit: 200_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Polita #${policy.id} a fost marcata ca expirata.`,
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tranzactia a esuat.";
      setActionMessage({ type: "error", message });
    } finally {
      setPendingAction(null);
    }
  };

  const policyDeskStats = useMemo(() => {
    const active = policies.filter((policy) => policy.state === PolicyState.Active).length;
    const paidOut = policies.filter((policy) => policy.state === PolicyState.PaidOut).length;
    const atRisk = policies.filter((policy) => {
      const latestSnapshot = riskFeed.snapshotsByLocation[policy.locationId];
      if (!latestSnapshot) return policy.payoutTriggered;
      return (
        latestSnapshot.riskScore >= policy.thresholdScore ||
        latestSnapshot.rain24h > policy.emergencyRain24h
      );
    }).length;

    return {
      total: policies.length,
      active,
      paidOut,
      atRisk,
    };
  }, [policies, riskFeed.snapshotsByLocation]);

  const selectedLiveSnapshot = selectedPolicy
    ? riskFeed.snapshotsByLocation[selectedPolicy.locationId] ?? selectedSummary?.latestSnapshot
    : null;

  const selectedSnapshotIsStale = selectedLiveSnapshot
    ? Date.now() - new Date(selectedLiveSnapshot.observedAt).getTime() > SNAPSHOT_STALE_MS
    : false;

  const selectedTriggerReached =
    selectedPolicy && selectedLiveSnapshot
      ? selectedLiveSnapshot.riskScore >= selectedPolicy.thresholdScore ||
        selectedLiveSnapshot.rain24h > selectedPolicy.emergencyRain24h
      : selectedPolicy?.payoutTriggered ?? false;

  const selectedTriggerProgress =
    selectedPolicy && selectedLiveSnapshot
      ? clamp(
          Math.max(
            (selectedLiveSnapshot.riskScore / Math.max(1, selectedPolicy.thresholdScore)) *
              100,
            (selectedLiveSnapshot.rain24h /
              Math.max(1, selectedPolicy.emergencyRain24h)) *
              100
          ),
          0,
          100
        )
      : 0;

  const mergedHistory = useMemo(() => {
    if (!selectedLiveSnapshot) {
      return selectedHistory;
    }

    if (selectedHistory.some((snapshot) => snapshot.id === selectedLiveSnapshot.id)) {
      return selectedHistory;
    }

    return [selectedLiveSnapshot, ...selectedHistory].slice(0, 8);
  }, [selectedHistory, selectedLiveSnapshot]);

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!walletConnected) {
    return (
      <div className="insurance-section">
        <div className="panel-header">
          <h2>Polite parametrice</h2>
          <p>Conecteaza portofelul pentru a vedea politele active.</p>
        </div>
        <p className="status-message status-message--warning">
          Conecteaza MetaMask pentru a vedea politele si ultimul snapshot de risc.
        </p>
      </div>
    );
  }

  return (
    <div className="insurance-section">
      <div className="panel-header">
        <h2>Policy desk</h2>
        <p>
          Urmareste fiecare polita ca obiect operational: trigger, ultima telemetrie,
          stare on-chain si pasii de administrare.
        </p>
        <div className="risk-feed">
          <span className={`risk-feed__pill risk-feed__pill--${riskFeed.status}`}>
            Feed risc: {riskFeed.status}
          </span>
        </div>
      </div>

      {actionMessage && (
        <p className={`status-message status-message--${actionMessage.type}`}>
          {actionMessage.message}
        </p>
      )}

      {riskFeed.errorMessage ? (
        <p className="status-message status-message--warning">{riskFeed.errorMessage}</p>
      ) : null}

      {loading ? (
        <div className="skeleton skeleton--table">
          <span>Se incarca politele...</span>
        </div>
      ) : policies.length === 0 ? (
        <div className="empty-state">
          <h3>Nu exista polite</h3>
          <p>Creeaza prima polita parametrica sau revino mai tarziu.</p>
        </div>
      ) : (
        <>
          <div className="insurance-summary-grid">
            <div className="insurance-summary-card insurance-summary-card--metric">
              <span>Total polite</span>
              <strong>{policyDeskStats.total}</strong>
            </div>
            <div className="insurance-summary-card insurance-summary-card--metric">
              <span>Active acum</span>
              <strong>{policyDeskStats.active}</strong>
            </div>
            <div className="insurance-summary-card insurance-summary-card--metric">
              <span>Sub trigger</span>
              <strong>{policyDeskStats.atRisk}</strong>
            </div>
            <div className="insurance-summary-card insurance-summary-card--metric">
              <span>Deja despagubite</span>
              <strong>{policyDeskStats.paidOut}</strong>
            </div>
          </div>

          <div className="policy-desk">
            <aside className="policy-desk__rail">
              {policies.map((policy) => {
                const latestSnapshot = riskFeed.snapshotsByLocation[policy.locationId];
                const displayRiskScore = latestSnapshot?.riskScore ?? policy.lastRiskScore ?? 0;
                const thresholdReached = latestSnapshot
                  ? latestSnapshot.riskScore >= policy.thresholdScore ||
                    latestSnapshot.rain24h > policy.emergencyRain24h
                  : policy.payoutTriggered;
                const snapshotIsStale = latestSnapshot
                  ? Date.now() - new Date(latestSnapshot.observedAt).getTime() >
                    SNAPSHOT_STALE_MS
                  : false;

                return (
                  <button
                    key={policy.id}
                    type="button"
                    className={[
                      "policy-card",
                      selectedPolicyId === policy.id ? "policy-card--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedPolicyId(policy.id)}
                  >
                    <div className="policy-card__header">
                      <div>
                        <span className="policy-card__eyebrow">
                          Policy #{policy.id}
                        </span>
                        <h4>{policy.cropType}</h4>
                        <p>{policy.locationLabel || policy.locationId}</p>
                      </div>
                      <span
                        className={[
                          "policy-state-pill",
                          `policy-state-pill--${POLICY_STATE_LABELS[policy.state]
                            .toLowerCase()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .replace(/\s+/g, "-")}`,
                        ].join(" ")}
                      >
                        {POLICY_STATE_LABELS[policy.state]}
                      </span>
                    </div>

                    <div className="policy-card__metrics">
                      <div className="policy-card__metric">
                        <span>Payout</span>
                        <strong>{policy.payoutEth} ETH</strong>
                      </div>
                      <div className="policy-card__metric">
                        <span>Risc</span>
                        <strong>{displayRiskScore}</strong>
                      </div>
                      <div className="policy-card__metric">
                        <span>Trigger</span>
                        <strong>{thresholdReached ? "Atins" : "Sub prag"}</strong>
                      </div>
                    </div>

                    <div className="policy-card__footer">
                      <small>{shortAddress(policy.user)}</small>
                      <small>
                        {latestSnapshot
                          ? `${latestSnapshot.weatherType || "-"} - 24h ${latestSnapshot.rain24h} mm`
                          : "Fara feed live"}
                      </small>
                      {snapshotIsStale ? <small>Flux vechi</small> : null}
                    </div>
                  </button>
                );
              })}
            </aside>

            <div className="policy-desk__detail">
              {selectedPolicy ? (
                <>
                  <section className="policy-hero">
                    <div className="policy-hero__content">
                      <span className="policy-hero__eyebrow">
                        Policy #{selectedPolicy.id}
                      </span>
                      <h3>
                        {selectedPolicy.cropType} -{" "}
                        {selectedPolicy.locationLabel || selectedPolicy.locationId}
                      </h3>
                      <p>
                        Fermier {shortAddress(selectedPolicy.user)} - activ intre{" "}
                        {formatDateTime(selectedPolicy.startTime)} si{" "}
                        {formatDateTime(selectedPolicy.endTime)}.
                      </p>
                    </div>

                    <div className="policy-hero__meta">
                      <div className="insurance-summary-card">
                        <span>Status polita</span>
                        <strong>{POLICY_STATE_LABELS[selectedPolicy.state]}</strong>
                      </div>
                      <div className="insurance-summary-card">
                        <span>Payout cap</span>
                        <strong>{selectedPolicy.payoutEth} ETH</strong>
                      </div>
                      <div className="insurance-summary-card">
                        <span>Ultim update oracle</span>
                        <strong>{formatDateTime(selectedPolicy.lastOracleUpdateAt)}</strong>
                      </div>
                    </div>
                  </section>

                  <div className="policy-detail-grid">
                    <div className="policy-detail-main">
                      <section className="policy-panel">
                        <div className="policy-panel__header">
                          <div>
                            <h4>Trigger gauge</h4>
                            <p>
                              Scor compus versus prag si override-ul de precipitatii
                              pe 24h.
                            </p>
                          </div>
                          <span
                            className={[
                              "risk-score__pill",
                              selectedTriggerReached
                                ? "risk-score__pill--triggered"
                                : selectedLiveSnapshot?.eventActive
                                ? "risk-score__pill--watch"
                                : "risk-score__pill--normal",
                            ].join(" ")}
                          >
                            {selectedTriggerReached
                              ? "Trigger atins"
                              : selectedLiveSnapshot?.eventActive
                              ? "Eveniment activ"
                              : "Sub prag"}
                          </span>
                        </div>

                        <div className="trigger-gauge">
                          <div className="trigger-gauge__bar">
                            <div
                              className="trigger-gauge__fill"
                              style={{ width: `${selectedTriggerProgress}%` }}
                            />
                          </div>
                          <div className="trigger-gauge__stats">
                            <div>
                              <span>Scor curent</span>
                              <strong>{selectedLiveSnapshot?.riskScore ?? 0}</strong>
                            </div>
                            <div>
                              <span>Prag scor</span>
                              <strong>{selectedPolicy.thresholdScore}</strong>
                            </div>
                            <div>
                              <span>Ploaie 24h</span>
                              <strong>
                                {formatNumber(selectedLiveSnapshot?.rain24h, 1)} mm
                              </strong>
                            </div>
                            <div>
                              <span>Prag urgenta</span>
                              <strong>{selectedPolicy.emergencyRain24h} mm</strong>
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="policy-panel">
                        <div className="policy-panel__header">
                          <div>
                            <h4>Ultimul raport meteo</h4>
                            <p>
                              Snapshotul cel mai recent folosit pentru evaluarea
                              trigger-ului.
                            </p>
                          </div>
                          {selectedSnapshotIsStale ? (
                            <span className="policy-muted-pill">Flux vechi</span>
                          ) : null}
                        </div>

                        {selectedLiveSnapshot ? (
                          <>
                            <div className="policy-metric-grid">
                              <div className="policy-metric-card">
                                <span>Observat la</span>
                                <strong>
                                  {formatDateTime(selectedLiveSnapshot.observedAt)}
                                </strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Tip vreme</span>
                                <strong>{selectedLiveSnapshot.weatherType || "-"}</strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Ploaie 1h</span>
                                <strong>{formatNumber(selectedLiveSnapshot.rain1h)} mm</strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Ploaie 24h</span>
                                <strong>
                                  {formatNumber(selectedLiveSnapshot.rain24h)} mm
                                </strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Ploaie 72h</span>
                                <strong>
                                  {formatNumber(selectedLiveSnapshot.rain72h)} mm
                                </strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Vant</span>
                                <strong>
                                  {formatNumber(selectedLiveSnapshot.windSpeed)} m/s
                                </strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Temperatura</span>
                                <strong>
                                  {formatNumber(selectedLiveSnapshot.temperature)} C
                                </strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Umiditate</span>
                                <strong>
                                  {formatNumber(selectedLiveSnapshot.humidity)} %
                                </strong>
                              </div>
                              <div className="policy-metric-card">
                                <span>Durata eveniment</span>
                                <strong>
                                  {selectedLiveSnapshot.eventDurationHours} h
                                </strong>
                              </div>
                            </div>

                            <div className="policy-rules">
                              <div className="policy-rules__section">
                                <span className="policy-rules__label">
                                  Reguli declansate
                                </span>
                                <div className="policy-chip-list">
                                  {selectedLiveSnapshot.matchedRules.length > 0 ? (
                                    selectedLiveSnapshot.matchedRules.map((rule) => (
                                      <span key={rule} className="policy-chip">
                                        {formatRuleLabel(rule)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="policy-chip policy-chip--muted">
                                      Nicio regula activa
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="policy-rules__section">
                                <span className="policy-rules__label">
                                  Explicatie motor risc
                                </span>
                                <ul className="policy-notes">
                                  {selectedLiveSnapshot.explanation.length > 0 ? (
                                    selectedLiveSnapshot.explanation.map((note) => (
                                      <li key={note}>{note}</li>
                                    ))
                                  ) : (
                                    <li>Snapshotul curent nu a acumulat reguli active.</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          </>
                        ) : detailLoading ? (
                          <div className="skeleton">
                            <span>Se incarca ultimul raport...</span>
                          </div>
                        ) : (
                          <div className="empty-state">
                            <h3>Fara snapshot de risc</h3>
                            <p>
                              Oracle-ul nu a trimis inca un raport pentru locatia
                              acestei polite.
                            </p>
                          </div>
                        )}
                      </section>

                      <section className="policy-panel">
                        <div className="policy-panel__header">
                          <div>
                            <h4>Timeline telemetrie</h4>
                            <p>Ultimele snapshoturi salvate pentru aceasta locatie.</p>
                          </div>
                        </div>

                        {mergedHistory.length > 0 ? (
                          <div className="policy-timeline">
                            {mergedHistory.map((snapshot) => (
                              <article key={snapshot.id} className="policy-timeline__item">
                                <div className="policy-timeline__time">
                                  {formatDateTime(snapshot.observedAt)}
                                </div>
                                <div className="policy-timeline__body">
                                  <strong>
                                    Scor {snapshot.riskScore} - {snapshot.weatherType || "-"}
                                  </strong>
                                  <span>
                                    24h {snapshot.rain24h} mm - 72h {snapshot.rain72h} mm -
                                    vant {snapshot.windSpeed} m/s - temp{" "}
                                    {snapshot.temperature} C
                                  </span>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : detailLoading ? (
                          <div className="skeleton">
                            <span>Se incarca istoricul...</span>
                          </div>
                        ) : (
                          <div className="empty-state">
                            <h3>Istoric indisponibil</h3>
                            <p>Nu exista inca suficiente snapshoturi pentru timeline.</p>
                          </div>
                        )}
                      </section>
                    </div>

                    <aside className="policy-detail-side">
                      <section className="policy-panel">
                        <div className="policy-panel__header">
                          <div>
                            <h4>Harta si locatie</h4>
                            <p>Context operational pentru locatia asigurata.</p>
                          </div>
                        </div>

                        <div className="policy-aside-stack">
                          <div className="policy-metric-card">
                            <span>Eticheta locatie</span>
                            <strong>
                              {selectedPolicy.locationLabel || selectedPolicy.locationId}
                            </strong>
                            <small>{selectedPolicy.locationId}</small>
                          </div>
                          <div className="policy-metric-card">
                            <span>Coordonate</span>
                            <strong>
                              {formatCoordinate(selectedPolicy.latitude)},{" "}
                              {formatCoordinate(selectedPolicy.longitude)}
                            </strong>
                          </div>
                          {typeof selectedPolicy.latitude === "number" &&
                          typeof selectedPolicy.longitude === "number" ? (
                            <div className="policy-aside-actions">
                              <a
                                className="secondary-button"
                                href={buildGoogleMapsUrl(
                                  selectedPolicy.latitude,
                                  selectedPolicy.longitude
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Google Maps
                              </a>
                              <a
                                className="secondary-button"
                                href={buildOpenStreetMapUrl(
                                  selectedPolicy.latitude,
                                  selectedPolicy.longitude
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                OpenStreetMap
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </section>

                      <section className="policy-panel">
                        <div className="policy-panel__header">
                          <div>
                            <h4>Stare settlement</h4>
                            <p>Ce trebuie sa stii despre starea on-chain.</p>
                          </div>
                        </div>

                        <div className="policy-aside-stack">
                          <div className="policy-metric-card">
                            <span>Status payout</span>
                            <strong>
                              {selectedPolicy.payoutTriggered
                                ? "Payout marcat"
                                : selectedTriggerReached
                                ? "Trigger atins"
                                : "In monitorizare"}
                            </strong>
                          </div>
                          <div className="policy-metric-card">
                            <span>Fereastra de acoperire</span>
                            <strong>
                              {selectedPolicy.endTime <= nowSeconds
                                ? "A iesit din fereastra"
                                : "Inca activa"}
                            </strong>
                            <small>
                              Final planificat: {formatDateTime(selectedPolicy.endTime)}
                            </small>
                          </div>
                          <div className="policy-metric-card">
                            <span>Ultimul scor on-chain</span>
                            <strong>{selectedPolicy.lastRiskScore}</strong>
                          </div>
                        </div>
                      </section>

                      {(isOwner || selectedPolicy.state === PolicyState.Active) && (
                        <section className="policy-panel">
                          <div className="policy-panel__header">
                            <div>
                              <h4>Actiuni</h4>
                              <p>Administrare manuala pentru situatii speciale.</p>
                            </div>
                          </div>

                          <div className="policy-aside-actions policy-aside-actions--stack">
                            {selectedPolicy.state === PolicyState.Active && isOwner ? (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => handleCancel(selectedPolicy)}
                                disabled={pendingAction === selectedPolicy.id}
                              >
                                {pendingAction === selectedPolicy.id
                                  ? "Se confirma..."
                                  : "Anuleaza polita"}
                              </button>
                            ) : null}

                            {selectedPolicy.state === PolicyState.Active &&
                            selectedPolicy.endTime <= nowSeconds ? (
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => handleExpire(selectedPolicy)}
                                disabled={pendingAction === selectedPolicy.id}
                              >
                                {pendingAction === selectedPolicy.id
                                  ? "Se confirma..."
                                  : "Marcheaza expirata"}
                              </button>
                            ) : null}
                          </div>
                        </section>
                      )}
                    </aside>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>Selecteaza o polita</h3>
                  <p>Alege o polita din lista pentru a vedea triggerul si istoricul.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InsurancePoliciesList;
