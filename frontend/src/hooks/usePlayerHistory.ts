import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../web3Config";
import { Match, MatchState, ZERO_ADDRESS } from "../types/match";

const DEFAULT_ELO = 1000;

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  inProgress: number;
  totalMatches: number;
  finishedMatches: number;
  winRate: number;
  totalStakeWei: bigint;
  eloRating: number;
}

export function usePlayerHistory(account: string | null, walletConnected: boolean) {
  const [history, setHistory] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eloRating, setEloRating] = useState(DEFAULT_ELO);

  const normalizedAccount = account?.toLowerCase() ?? null;

  const fetchHistory = useCallback(async () => {
    if (!walletConnected || !account) {
      setHistory([]);
      setLoading(false);
      setError(null);
      setEloRating(DEFAULT_ELO);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { contract } = await getContract();
      const [historyResponse, currentElo] = await Promise.all([
        contract.getPlayerHistory(account),
        contract.getPlayerElo(account),
      ]);
      const [rawMatches, rawIds] = historyResponse;

      const formatted: Match[] = rawMatches.map((match: any, index: number) => {
        const betAmountWei = BigInt(match.betAmount?.toString?.() ?? "0");
        const boardValues = Array.from(
          match.board as ArrayLike<number | bigint>,
          (cell) => Number(cell)
        );

        return {
          id: Number(rawIds[index]),
          player1: match.player1,
          player2: match.player2,
          betAmountWei,
          betAmountEth: ethers.formatEther(betAmountWei),
          state: Number(match.state) as MatchState,
          winner: match.winner,
          currentTurn: match.currentTurn,
          moves: Number(match.moves),
          board: boardValues,
        };
      });

      formatted.sort((a, b) => b.id - a.id);
      setHistory(formatted);
      setEloRating(Number(currentElo));
    } catch (historyError) {
      console.error("Unable to fetch match history", historyError);
      setError("Nu am putut citi istoricul meciurilor. Reincearca in cateva momente.");
    } finally {
      setLoading(false);
    }
  }, [walletConnected, account]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!walletConnected || !account) return;

    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { contract } = await getContract();
        const refresh = () => {
          if (isMounted) {
            fetchHistory();
          }
        };

        contract.on("MatchCreated", refresh);
        contract.on("MatchJoined", refresh);
        contract.on("MatchStarted", refresh);
        contract.on("MovePlayed", refresh);
        contract.on("MatchFinished", refresh);

        cleanup = () => {
          contract.off("MatchCreated", refresh);
          contract.off("MatchJoined", refresh);
          contract.off("MatchStarted", refresh);
          contract.off("MovePlayed", refresh);
          contract.off("MatchFinished", refresh);
        };
      } catch (listenerError) {
        console.warn("Unable to attach history listeners", listenerError);
      }
    };

    setupListeners();
    const refreshEvent = () => fetchHistory();
    window.addEventListener("matches:refresh", refreshEvent);

    return () => {
      isMounted = false;
      cleanup?.();
      window.removeEventListener("matches:refresh", refreshEvent);
    };
  }, [walletConnected, account, fetchHistory]);

  const stats = useMemo<PlayerStats>(() => {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let inProgress = 0;
    let totalStake = BigInt(0);

    history.forEach((match) => {
      totalStake += match.betAmountWei;

      if (match.state !== MatchState.Finished) {
        inProgress += 1;
        return;
      }

      if (match.winner === ZERO_ADDRESS) {
        draws += 1;
        return;
      }

      if (normalizedAccount && match.winner.toLowerCase() === normalizedAccount) {
        wins += 1;
      } else {
        losses += 1;
      }
    });

    const finishedMatches = wins + losses + draws;
    const totalMatches = history.length;
    const winRate = finishedMatches === 0 ? 0 : (wins / finishedMatches) * 100;

    return {
      wins,
      losses,
      draws,
      inProgress,
      totalMatches,
      finishedMatches,
      winRate,
      totalStakeWei: totalStake,
      eloRating,
    };
  }, [history, normalizedAccount, eloRating]);

  return {
    history,
    loading,
    error,
    stats,
    refresh: fetchHistory,
  };
}
