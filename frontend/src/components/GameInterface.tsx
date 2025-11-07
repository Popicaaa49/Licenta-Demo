import React, { useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../web3Config";

type StatusPayload = { type: "success" | "error"; message: string };

interface GameInterfaceProps {
  walletConnected: boolean;
}

const GameInterface: React.FC<GameInterfaceProps> = ({ walletConnected }) => {
  const [betAmount, setBetAmount] = useState("0.01");
  const [joinMatchId, setJoinMatchId] = useState("");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const showStatus = (payload: StatusPayload) => {
    setStatus(payload);
  };

  const createMatch = async () => {
    if (!walletConnected) {
      showStatus({
        type: "error",
        message: "Conectează-ți portofelul pentru a crea un meci.",
      });
      return;
    }

    const parsedBet = Number(betAmount);
    if (!betAmount || Number.isNaN(parsedBet) || parsedBet <= 0) {
      showStatus({ type: "error", message: "Introdu o miză validă în ETH." });
      return;
    }

    try {
      setIsCreating(true);
      showStatus({ type: "success", message: "Se trimite tranzacția..." });

      const { contract } = await getContract();
      const tx = await contract.createMatch({
        value: ethers.parseEther(betAmount),
        gasLimit: 200_000,
      });

      await tx.wait();
      showStatus({
        type: "success",
        message: "Meciul a fost creat! Așteaptă un adversar.",
      });
      window.dispatchEvent(new CustomEvent("matches:refresh"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tranzacție eșuată.";
      showStatus({ type: "error", message: `Eroare la crearea meciului: ${message}` });
    } finally {
      setIsCreating(false);
    }
  };

  const joinMatch = async () => {
    if (!walletConnected) {
      showStatus({
        type: "error",
        message: "Conectează-ți portofelul pentru a te alătura unui meci.",
      });
      return;
    }

    const id = Number(joinMatchId.trim());
    if (!Number.isInteger(id) || id < 0) {
      showStatus({ type: "error", message: "Introdu un ID de meci valid." });
      return;
    }

    const parsedBet = Number(betAmount);
    if (!betAmount || Number.isNaN(parsedBet) || parsedBet <= 0) {
      showStatus({
        type: "error",
        message: "Introdu o miză validă care să corespundă meciului.",
      });
      return;
    }

    try {
      setIsJoining(true);
      showStatus({ type: "success", message: "Se trimite tranzacția..." });

      const { contract } = await getContract();
      const tx = await contract.joinMatch(id, {
        value: ethers.parseEther(betAmount),
        gasLimit: 200_000,
      });

      await tx.wait();
      showStatus({
        type: "success",
        message: `Te-ai alăturat meciului #${id}. Succes!`,
      });
      window.dispatchEvent(new CustomEvent("matches:refresh"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tranzacție eșuată.";
      showStatus({ type: "error", message: `Eroare la alăturare: ${message}` });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="match-actions">
      <div className="panel-header">
        <h2>Gestionează meciurile</h2>
        <p>
          Stabilește miza, creează un nou meci sau alătură-te unuia existent folosind ID-ul
          afișat în listă.
        </p>
      </div>

      <div className="form-grid">
        <label className="form-field">
          <span>Miza (ETH)</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="0.01"
          />
        </label>

        <button
          type="button"
          className="primary-button"
          onClick={createMatch}
          disabled={isCreating || !walletConnected}
        >
          {isCreating ? "Se confirmă..." : "Creează meci"}
        </button>
      </div>

      <div className="form-grid">
        <label className="form-field">
          <span>ID meci</span>
          <input
            type="number"
            min="0"
            value={joinMatchId}
            onChange={(e) => setJoinMatchId(e.target.value)}
            placeholder="0"
          />
        </label>

        <button
          type="button"
          className="secondary-button"
          onClick={joinMatch}
          disabled={isJoining || !walletConnected}
        >
          {isJoining ? "Se confirmă..." : "Alătură-te meciului"}
        </button>
      </div>

      {status && (
        <p
          className={`status-message ${
            status.type === "success" ? "status-message--success" : "status-message--error"
          }`}
        >
          {status.message}
        </p>
      )}

      {!walletConnected && (
        <p className="status-message status-message--warning">
          Conectează MetaMask pentru a începe.
        </p>
      )}
    </div>
  );
};

export default GameInterface;
