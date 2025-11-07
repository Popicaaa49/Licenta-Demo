import React, { useState } from "react";

interface WalletConnectProps {
  account: string | null;
  networkLabel: string;
  onConnect: (account: string, chainIdHex?: string) => void;
  onDisconnect?: () => void;
}

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(address.length - 4)}`;

const WalletConnect: React.FC<WalletConnectProps> = ({
  account,
  networkLabel,
  onConnect,
  onDisconnect,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!window.ethereum) {
      setError("Instalează MetaMask pentru a continua.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = (await window.ethereum.request?.({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error("Nu s-a identificat niciun cont MetaMask.");
      }

      const chainId = (await window.ethereum.request?.({
        method: "eth_chainId",
      })) as string | undefined;

      onConnect(accounts[0], chainId);
    } catch (connectError) {
      const message =
        connectError instanceof Error
          ? connectError.message
          : "Conectarea la portofel a eșuat.";
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setError(null);
    if (onDisconnect) {
      onDisconnect();
    }
  };

  return (
    <div className="wallet-panel">
      <div className="wallet-card">
        <div className="wallet-card__header">
          <span className="wallet-label">Portofel</span>
          {account ? (
            <button
              className="tertiary-button"
              type="button"
              onClick={handleDisconnect}
            >
              Deconectează
            </button>
          ) : null}
        </div>

        {account ? (
          <div className="wallet-card__details">
            <strong className="wallet-account">{truncateAddress(account)}</strong>
            <span className="wallet-network">{networkLabel || "Rețea necunoscută"}</span>
          </div>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? "Se conectează..." : "Conectează MetaMask"}
          </button>
        )}
      </div>
      {error && <p className="status-message status-message--error">{error}</p>}
    </div>
  );
};

export default WalletConnect;
