import React from "react";
import { ethers } from "ethers";
import { Match, MatchState, ZERO_ADDRESS } from "../types/match";
import { PlayerStats } from "../hooks/usePlayerHistory";

interface AccountStatsProps {
  walletConnected: boolean;
  account: string | null;
  loading: boolean;
  error: string | null;
  stats: PlayerStats;
  history: Match[];
}

const AccountStats: React.FC<AccountStatsProps> = ({
  walletConnected,
  account,
  loading,
  error,
  stats,
  history,
}) => {
  if (!walletConnected || !account) {
    return (
      <div className="stats-empty">
        <p>Conecteaza MetaMask pentru a vedea statistici personalizate.</p>
      </div>
    );
  }

  const normalizedAccount = account.toLowerCase();
  const winRateLabel = Number.isFinite(stats.winRate)
    ? `${stats.winRate.toFixed(1)}%`
    : "0%";

  const totalStakeEth = ethers.formatEther(stats.totalStakeWei);

  const lastMatches = history.slice(0, 5);

  const resolveResult = (match: Match) => {
    if (match.state !== MatchState.Finished) return "In desfasurare";
    if (match.winner === ZERO_ADDRESS) return "Egal";
    if (match.winner.toLowerCase() === normalizedAccount) return "Victorie";
    return "Infrangere";
  };

  return (
    <div className="stats-content">
      <div className="stats-grid">
        <div className="stats-card">
          <span>ELO curent</span>
          <strong>{stats.eloRating}</strong>
        </div>
        <div className="stats-card">
          <span>Total meciuri</span>
          <strong>{stats.totalMatches}</strong>
        </div>
        <div className="stats-card">
          <span>Victorii</span>
          <strong>{stats.wins}</strong>
        </div>
        <div className="stats-card">
          <span>Infrangeri</span>
          <strong>{stats.losses}</strong>
        </div>
        <div className="stats-card">
          <span>Remize</span>
          <strong>{stats.draws}</strong>
        </div>
        <div className="stats-card">
          <span>Meciuri active</span>
          <strong>{stats.inProgress}</strong>
        </div>
        <div className="stats-card">
          <span>Win rate</span>
          <strong>{winRateLabel}</strong>
        </div>
        <div className="stats-card">
          <span>Total miza (ETH)</span>
          <strong>{totalStakeEth}</strong>
        </div>
      </div>

      {error && (
        <p className="status-message status-message--error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="skeleton skeleton--table">
          <span>Se calculeaza statisticile...</span>
        </div>
      ) : lastMatches.length === 0 ? (
        <div className="empty-state">
          <h3>Nu exista inca rezultate</h3>
          <p>Joaca cel putin un meci pentru a vedea istoricul si statisticile.</p>
        </div>
      ) : (
        <div className="stats-list">
          <h4>Meciuri recente</h4>
          <ul>
            {lastMatches.map((match) => (
              <li key={match.id}>
                <span>Meci #{match.id}</span>
                <span>{match.betAmountEth} ETH</span>
                <span>{resolveResult(match)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AccountStats;
