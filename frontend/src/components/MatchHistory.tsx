import React from "react";
import { Match, MatchState, MATCH_STATE_LABELS, ZERO_ADDRESS } from "../types/match";

interface MatchHistoryProps {
  walletConnected: boolean;
  account: string | null;
  history: Match[];
  loading: boolean;
  error: string | null;
}

const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const MatchHistory: React.FC<MatchHistoryProps> = ({
  walletConnected,
  account,
  history,
  loading,
  error,
}) => {
  const normalizedAccount = account?.toLowerCase() ?? null;

  const resolveOpponent = (match: Match) => {
    if (!normalizedAccount) return ZERO_ADDRESS;
    const isPlayer1 = match.player1.toLowerCase() === normalizedAccount;
    return isPlayer1 ? match.player2 : match.player1;
  };

  const renderResult = (match: Match) => {
    if (match.state !== MatchState.Finished) {
      return "In desfasurare";
    }
    if (match.winner === ZERO_ADDRESS) return "Egal";
    if (normalizedAccount && match.winner.toLowerCase() === normalizedAccount) return "Victorie";
    return "Infrangere";
  };

  if (!walletConnected || !account) {
    return (
      <div className="history-section">
        <div className="panel-header">
          <h2>Istoric meciuri</h2>
          <p>Conecteaza MetaMask pentru a vedea rezultatele din trecut.</p>
        </div>
        <p className="status-message status-message--warning">
          Este nevoie de un portofel conectat pentru a incarca istoricul personal.
        </p>
      </div>
    );
  }

  return (
    <div className="history-section">
      <div className="panel-header">
        <h2>Istoric meciuri</h2>
        <p>Vezi rapid sesiunile la care ai participat si stadiul fiecarui meci.</p>
      </div>

      {error && (
        <p className="status-message status-message--error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="skeleton skeleton--table">
          <span>Se incarca istoricul...</span>
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <h3>Inca nu ai jucat niciun meci</h3>
          <p>Creeaza un meci sau alatura-te unuia existent pentru a incepe istoricul.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Adversar</th>
                <th>Miza (ETH)</th>
                <th>Mutari</th>
                <th>Status</th>
                <th>Rezultat</th>
              </tr>
            </thead>
            <tbody>
              {history.map((match) => {
                const opponent = resolveOpponent(match);
                const statusLabel = MATCH_STATE_LABELS[match.state];
                const resultLabel = renderResult(match);

                return (
                  <tr key={match.id}>
                    <td>{match.id}</td>
                    <td>
                      {opponent === ZERO_ADDRESS ? "Niciun adversar" : shortAddress(opponent)}
                    </td>
                    <td>{match.betAmountEth}</td>
                    <td>{match.moves}</td>
                    <td>{statusLabel}</td>
                    <td>{resultLabel}</td>
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

export default MatchHistory;
