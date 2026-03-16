import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getInsuranceContract } from "../web3Config";
import {
  Policy,
  PolicyState,
  POLICY_STATE_LABELS,
  ZERO_ADDRESS,
} from "../types/insurance";

type StatusPayload = { type: "success" | "error" | "warning"; message: string };

interface InsurancePoliciesListProps {
  walletConnected: boolean;
  account: string | null;
}

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(address.length - 4)}`;

const formatTimestamp = (timestamp: number) => {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
};

const InsurancePoliciesList: React.FC<InsurancePoliciesListProps> = ({
  walletConnected,
  account,
}) => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<StatusPayload | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    id: number;
    action: string;
  } | null>(null);
  const [oracleAddress, setOracleAddress] = useState<string | null>(null);

  const isOracle = useMemo(() => {
    if (!account || !oracleAddress) return false;
    return account.toLowerCase() === oracleAddress.toLowerCase();
  }, [account, oracleAddress]);

  const fetchPolicies = useCallback(async () => {
    if (!walletConnected) {
      setPolicies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { contract } = await getInsuranceContract();
      const [data, oracle] = await Promise.all([
        contract.getPolicies(),
        contract.oracle(),
      ]);

      const formatted: Policy[] = data.map((p: any, i: number) => {
        const coverageWei = BigInt(p.coverageAmount?.toString?.() ?? "0");
        const premiumWei = BigInt(p.premiumAmount?.toString?.() ?? "0");
        const durationSeconds = Number(p.durationSeconds ?? 0);
        const startTime = Number(p.startTime ?? 0);
        const endTime = Number(p.endTime ?? 0);
        const windSpeed = Number(p.windSpeedKmh ?? 0);

        return {
          id: i,
          insurer: p.insurer,
          insured: p.insured,
          coverageWei,
          coverageEth: ethers.formatEther(coverageWei),
          premiumWei,
          premiumEth: ethers.formatEther(premiumWei),
          durationSeconds,
          startTime,
          endTime,
          location: p.location,
          windSpeedKmh: windSpeed,
          state: Number(p.state) as PolicyState,
          eventOccurred: Boolean(p.eventOccurred),
        };
      });

      setPolicies(formatted);
      setOracleAddress(oracle);
    } catch (err) {
      console.error("Error fetching policies:", err);
      setActionMessage({
        type: "error",
        message:
          "Nu am putut incarca politele. Verifica conexiunea la retea.",
      });
    } finally {
      setLoading(false);
    }
  }, [walletConnected]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

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

        const onOffered = () => refresh("PolicyOffered");
        const onAccepted = () => refresh("PolicyAccepted");
        const onResolved = () => refresh("PolicyResolved");
        const onCancelled = () => refresh("PolicyCancelled");

        contract.on("PolicyOffered", onOffered);
        contract.on("PolicyAccepted", onAccepted);
        contract.on("PolicyResolved", onResolved);
        contract.on("PolicyCancelled", onCancelled);

        cleanup = () => {
          contract.off("PolicyOffered", onOffered);
          contract.off("PolicyAccepted", onAccepted);
          contract.off("PolicyResolved", onResolved);
          contract.off("PolicyCancelled", onCancelled);
        };
      } catch (listenerError) {
        console.warn("Unable to attach policy listeners", listenerError);
      }
    };

    setupListeners();

    const refreshListener = () => isMounted && fetchPolicies();
    window.addEventListener("policies:refresh", refreshListener);

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
      window.removeEventListener("policies:refresh", refreshListener);
    };
  }, [walletConnected, fetchPolicies]);

  const setPending = (id: number, action: string | null) => {
    if (!action) {
      setPendingAction(null);
    } else {
      setPendingAction({ id, action });
    }
  };

  const isPending = (id: number, action: string) =>
    pendingAction?.id === id && pendingAction?.action === action;

  const handleAccept = async (policy: Policy) => {
    if (!walletConnected) {
      setActionMessage({
        type: "warning",
        message: "Conecteaza MetaMask inainte de a accepta o oferta.",
      });
      return;
    }

    try {
      setPending(policy.id, "accept");
      setActionMessage(null);
      const { contract } = await getInsuranceContract();
      const tx = await contract.acceptPolicy(policy.id, {
        value: policy.premiumWei,
        gasLimit: 250_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Ai acceptat polita #${policy.id}.`,
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tranzactia a esuat.";
      setActionMessage({ type: "error", message });
    } finally {
      setPending(policy.id, null);
    }
  };

  const handleCancel = async (policy: Policy) => {
    try {
      setPending(policy.id, "cancel");
      setActionMessage(null);
      const { contract } = await getInsuranceContract();
      const tx = await contract.cancelOffer(policy.id, {
        gasLimit: 200_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Oferta #${policy.id} a fost anulata.`,
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tranzactia a esuat.";
      setActionMessage({ type: "error", message });
    } finally {
      setPending(policy.id, null);
    }
  };

  const handleResolve = async (policy: Policy, eventOccurred: boolean) => {
    try {
      setPending(policy.id, eventOccurred ? "resolve-yes" : "resolve-no");
      setActionMessage(null);
      const { contract } = await getInsuranceContract();
      const tx = await contract.resolvePolicy(policy.id, eventOccurred, {
        gasLimit: 250_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Polita #${policy.id} a fost rezolvata.`,
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tranzactia a esuat.";
      setActionMessage({ type: "error", message });
    } finally {
      setPending(policy.id, null);
    }
  };

  const handleFinalizeExpired = async (policy: Policy) => {
    try {
      setPending(policy.id, "finalize");
      setActionMessage(null);
      const { contract } = await getInsuranceContract();
      const tx = await contract.finalizeExpiredPolicy(policy.id, {
        gasLimit: 200_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Polita #${policy.id} a fost inchisa.`,
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tranzactia a esuat.";
      setActionMessage({ type: "error", message });
    } finally {
      setPending(policy.id, null);
    }
  };

  const renderStatus = (policy: Policy) => {
    if (policy.state === PolicyState.Resolved) {
      return policy.eventOccurred
        ? "Rezolvata · eveniment confirmat"
        : "Rezolvata · fara eveniment";
    }

    if (policy.state === PolicyState.Active) {
      return `${POLICY_STATE_LABELS[policy.state]} · Expira: ${formatTimestamp(
        policy.endTime
      )}`;
    }

    return POLICY_STATE_LABELS[policy.state] ?? "-";
  };

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!walletConnected) {
    return (
      <div className="insurance-section">
        <div className="panel-header">
          <h2>Polite disponibile</h2>
          <p>Conecteaza portofelul pentru a vedea piata de asigurari.</p>
        </div>
        <p className="status-message status-message--warning">
          Conecteaza MetaMask pentru a vedea ofertele si a intra in polite.
        </p>
      </div>
    );
  }

  return (
    <div className="insurance-section">
      <div className="panel-header">
        <h2>Polite disponibile</h2>
        <p>
          Alege o polita P2P, verifica detaliile meteo si accepta oferta daca
          esti fermierul interesat.
        </p>
      </div>

      {actionMessage && (
        <p className={`status-message status-message--${actionMessage.type}`}>
          {actionMessage.message}
        </p>
      )}

      {loading ? (
        <div className="skeleton skeleton--table">
          <span>Se incarca politele...</span>
        </div>
      ) : policies.length === 0 ? (
        <div className="empty-state">
          <h3>Nu exista polite</h3>
          <p>Publica prima oferta sau revino mai tarziu pentru noi oportunitati.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="policies-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Asigurator</th>
                <th>Fermier</th>
                <th>Acoperire</th>
                <th>Prima</th>
                <th>Durata</th>
                <th>Locatie</th>
                <th>Vant (km/h)</th>
                <th>Status</th>
                <th>Actiuni</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const isOffer = p.state === PolicyState.Offered;
                const isActive = p.state === PolicyState.Active;
                const isExpired = isActive && p.endTime > 0 && p.endTime <= nowSeconds;
                const isInsurer =
                  account && account.toLowerCase() === p.insurer.toLowerCase();

                return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{shortAddress(p.insurer)}</td>
                    <td>
                      {p.insured === ZERO_ADDRESS
                        ? "---"
                        : shortAddress(p.insured)}
                    </td>
                    <td>{p.coverageEth}</td>
                    <td>{p.premiumEth}</td>
                    <td>{Math.ceil(p.durationSeconds / 86400)} zile</td>
                    <td>{p.location || "-"}</td>
                    <td>{p.windSpeedKmh || "-"}</td>
                    <td>{renderStatus(p)}</td>
                    <td>
                      <div className="action-stack">
                        {isOffer && !isInsurer ? (
                          <button
                            type="button"
                            className="primary-button primary-button--compact"
                            onClick={() => handleAccept(p)}
                            disabled={isPending(p.id, "accept")}
                          >
                            {isPending(p.id, "accept") ? "Se confirma..." : "Accepta"}
                          </button>
                        ) : null}

                        {isOffer && isInsurer ? (
                          <button
                            type="button"
                            className="secondary-button primary-button--compact"
                            onClick={() => handleCancel(p)}
                            disabled={isPending(p.id, "cancel")}
                          >
                            {isPending(p.id, "cancel") ? "Se confirma..." : "Anuleaza"}
                          </button>
                        ) : null}

                        {isActive && isOracle ? (
                          <>
                            <button
                              type="button"
                              className="primary-button primary-button--compact"
                              onClick={() => handleResolve(p, true)}
                              disabled={isPending(p.id, "resolve-yes")}
                            >
                              {isPending(p.id, "resolve-yes")
                                ? "Se confirma..."
                                : "Confirma furtuna"}
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleResolve(p, false)}
                              disabled={isPending(p.id, "resolve-no")}
                            >
                              {isPending(p.id, "resolve-no")
                                ? "Se confirma..."
                                : "Fara eveniment"}
                            </button>
                          </>
                        ) : null}

                        {isExpired ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleFinalizeExpired(p)}
                            disabled={isPending(p.id, "finalize")}
                          >
                            {isPending(p.id, "finalize")
                              ? "Se confirma..."
                              : "Finalizeaza expirata"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InsurancePoliciesList;
