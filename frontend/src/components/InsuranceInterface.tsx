import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getInsuranceContract } from "../web3Config";

type StatusPayload = { type: "success" | "error" | "warning"; message: string };

interface InsuranceInterfaceProps {
  walletConnected: boolean;
  account: string | null;
}

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(address.length - 4)}`;

const InsuranceInterface: React.FC<InsuranceInterfaceProps> = ({
  walletConnected,
  account,
}) => {
  const [coverageAmount, setCoverageAmount] = useState("0.05");
  const [premiumAmount, setPremiumAmount] = useState("0.005");
  const [durationDays, setDurationDays] = useState("7");
  const [location, setLocation] = useState("Timis");
  const [windSpeedKmh, setWindSpeedKmh] = useState("80");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [oracleAddress, setOracleAddress] = useState<string | null>(null);
  const [verifyAddress, setVerifyAddress] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const isOwner = useMemo(() => {
    if (!account || !ownerAddress) return false;
    return account.toLowerCase() === ownerAddress.toLowerCase();
  }, [account, ownerAddress]);

  useEffect(() => {
    if (!walletConnected) {
      setOwnerAddress(null);
      setOracleAddress(null);
      return;
    }

    let isMounted = true;

    const loadAdminInfo = async () => {
      try {
        const { contract } = await getInsuranceContract();
        const [owner, oracle] = await Promise.all([
          contract.owner(),
          contract.oracle(),
        ]);

        if (!isMounted) return;
        setOwnerAddress(owner);
        setOracleAddress(oracle);
      } catch (err) {
        console.warn("Unable to load insurance admin data", err);
      }
    };

    loadAdminInfo();

    return () => {
      isMounted = false;
    };
  }, [walletConnected]);

  const publishOffer = async () => {
    if (!walletConnected) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul pentru a publica o oferta.",
      });
      return;
    }

    const coverageValue = Number(coverageAmount);
    const premiumValue = Number(premiumAmount);
    const durationValue = Number(durationDays);
    const windValue = Number(windSpeedKmh);

    if (!coverageAmount || Number.isNaN(coverageValue) || coverageValue <= 0) {
      setStatus({ type: "error", message: "Introdu o acoperire valida." });
      return;
    }

    if (!premiumAmount || Number.isNaN(premiumValue) || premiumValue <= 0) {
      setStatus({ type: "error", message: "Introdu o prima valida." });
      return;
    }

    if (!durationDays || Number.isNaN(durationValue) || durationValue <= 0) {
      setStatus({ type: "error", message: "Durata trebuie sa fie valida." });
      return;
    }

    if (!location.trim()) {
      setStatus({ type: "error", message: "Locatia nu poate fi goala." });
      return;
    }

    if (!windSpeedKmh || Number.isNaN(windValue) || windValue <= 0) {
      setStatus({ type: "error", message: "Viteza vantului trebuie sa fie valida." });
      return;
    }

    try {
      setIsPublishing(true);
      setStatus({ type: "success", message: "Se trimite oferta..." });

      const durationSeconds = Math.floor(durationValue * 24 * 60 * 60);
      const { contract } = await getInsuranceContract();
      const tx = await contract.createPolicyOffer(
        ethers.parseEther(premiumAmount),
        durationSeconds,
        location.trim(),
        Math.round(windValue),
        {
          value: ethers.parseEther(coverageAmount),
          gasLimit: 400_000,
        }
      );

      await tx.wait();
      setStatus({
        type: "success",
        message: "Oferta a fost publicata. Asteapta un fermier.",
      });
      window.dispatchEvent(new CustomEvent("policies:refresh"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Publicarea ofertei a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVerify = async () => {
    if (!walletConnected) {
      setStatus({
        type: "warning",
        message: "Conecteaza portofelul pentru a administra verificarea.",
      });
      return;
    }

    if (!isOwner) {
      setStatus({
        type: "error",
        message: "Doar ownerul contractului poate verifica adrese.",
      });
      return;
    }

    if (!ethers.isAddress(verifyAddress)) {
      setStatus({
        type: "error",
        message: "Introdu o adresa valida pentru verificare.",
      });
      return;
    }

    try {
      setIsVerifying(true);
      setStatus({ type: "success", message: "Se trimite verificarea..." });
      const { contract } = await getInsuranceContract();
      const tx = await contract.setVerified(verifyAddress, true, {
        gasLimit: 150_000,
      });
      await tx.wait();
      setStatus({
        type: "success",
        message: "Adresa a fost verificata cu succes.",
      });
      setVerifyAddress("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verificarea a esuat.";
      setStatus({ type: "error", message });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="insurance-actions">
      <div className="panel-header">
        <h2>Asigurari parametrice</h2>
        <p>
          Publica o oferta de asigurare P2P. Fermierul plateste prima, iar
          oracle-ul confirma evenimentul meteo.
        </p>
      </div>

      <div className="form-row">
        <label className="form-field">
          <span>Acoperire (ETH)</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={coverageAmount}
            onChange={(e) => setCoverageAmount(e.target.value)}
            placeholder="0.05"
          />
        </label>

        <label className="form-field">
          <span>Prima (ETH)</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={premiumAmount}
            onChange={(e) => setPremiumAmount(e.target.value)}
            placeholder="0.005"
          />
        </label>

        <label className="form-field">
          <span>Durata (zile)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder="7"
          />
        </label>
      </div>

      <div className="form-row">
        <label className="form-field">
          <span>Locatie</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Timis"
          />
        </label>

        <label className="form-field">
          <span>Viteza vant (km/h)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={windSpeedKmh}
            onChange={(e) => setWindSpeedKmh(e.target.value)}
            placeholder="80"
          />
        </label>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="primary-button"
          onClick={publishOffer}
          disabled={isPublishing || !walletConnected}
        >
          {isPublishing ? "Se publica..." : "Publica oferta"}
        </button>
      </div>

      {status && (
        <p
          className={`status-message ${
            status.type === "success"
              ? "status-message--success"
              : status.type === "warning"
                ? "status-message--warning"
                : "status-message--error"
          }`}
        >
          {status.message}
        </p>
      )}

      {!walletConnected && (
        <p className="status-message status-message--warning">
          Conecteaza MetaMask pentru a crea oferte de asigurare.
        </p>
      )}

      {(ownerAddress || oracleAddress) && (
        <div className="insurance-meta">
          {ownerAddress ? (
            <span>Owner: {shortAddress(ownerAddress)}</span>
          ) : null}
          {oracleAddress ? (
            <span>Oracle: {shortAddress(oracleAddress)}</span>
          ) : null}
        </div>
      )}

      {isOwner && (
        <div className="admin-card">
          <h3>Admin</h3>
          <div className="form-grid">
            <label className="form-field">
              <span>Verifica adresa</span>
              <input
                type="text"
                value={verifyAddress}
                onChange={(e) => setVerifyAddress(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={handleVerify}
              disabled={isVerifying}
            >
              {isVerifying ? "Se trimite..." : "Verifica"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsuranceInterface;
