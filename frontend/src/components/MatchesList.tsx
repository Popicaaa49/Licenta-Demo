import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../web3Config";
import TicTacToeBoard from "./TicTacToeBoard";
import {
  Match,
  MatchState,
  MATCH_STATE_LABELS,
  ZERO_ADDRESS,
} from "../types/match";

type StatusPayload = { type: "success" | "error" | "warning"; message: string };

interface MatchesListProps {
  walletConnected: boolean;
  account: string | null;
}

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(address.length - 4)}`;

const MatchesList: React.FC<MatchesListProps> = ({ walletConnected, account }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<StatusPayload | null>(null);
  const [joiningMatchId, setJoiningMatchId] = useState<number | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  const activeMatches = useMemo(
    () => matches.filter((m) => m.state !== MatchState.Finished),
    [matches]
  );

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  const fetchMatches = useCallback(async () => {
    if (!walletConnected) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { contract } = await getContract();
      const data = await contract.getMatches();

      const formatted: Match[] = data.map((m: any, i: number) => {
        const betAmountWei = BigInt(m.betAmount?.toString?.() ?? "0");
        const boardValues = Array.from(
          m.board as ArrayLike<number | bigint>,
          (cell) => Number(cell)
        );

        return {
          id: i,
          player1: m.player1,
          player2: m.player2,
          betAmountWei,
          betAmountEth: ethers.formatEther(betAmountWei),
          state: Number(m.state) as MatchState,
          winner: m.winner,
          currentTurn: m.currentTurn,
          moves: Number(m.moves),
          board: boardValues,
        };
      });

      setMatches(formatted);
    } catch (err) {
      console.error("Error fetching matches:", err);
      setActionMessage({
        type: "error",
        message: "Nu am putut încărca meciurile. Verifică conexiunea la rețea.",
      });
    } finally {
      setLoading(false);
    }
  }, [walletConnected]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    if (selectedMatchId === null) return;
    const match = matches.find((m) => m.id === selectedMatchId);
    if (!match || match.state === MatchState.Finished) {
      setSelectedMatchId(null);
    }
  }, [matches, selectedMatchId]);

  useEffect(() => {
    if (!walletConnected) return;

    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { contract } = await getContract();

        const refresh = (label: string) => {
          if (isMounted) {
            console.log(`${label} event detected -> refreshing list`);
            fetchMatches();
          }
        };

        const onCreated = () => refresh("MatchCreated");
        const onJoined = () => refresh("MatchJoined");
        const onStarted = () => refresh("MatchStarted");
        const onMove = () => refresh("MovePlayed");
        const onFinished = () => refresh("MatchFinished");

        contract.on("MatchCreated", onCreated);
        contract.on("MatchJoined", onJoined);
        contract.on("MatchStarted", onStarted);
        contract.on("MovePlayed", onMove);
        contract.on("MatchFinished", onFinished);

        cleanup = () => {
          contract.off("MatchCreated", onCreated);
          contract.off("MatchJoined", onJoined);
          contract.off("MatchStarted", onStarted);
          contract.off("MovePlayed", onMove);
          contract.off("MatchFinished", onFinished);
        };
      } catch (listenerError) {
        console.warn("Unable to attach match listeners", listenerError);
      }
    };

    setupListeners();

    const refreshListener = () => isMounted && fetchMatches();
    window.addEventListener("matches:refresh", refreshListener);

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
      window.removeEventListener("matches:refresh", refreshListener);
    };
  }, [walletConnected, fetchMatches]);

  const handleJoin = async (match: Match) => {
    if (!walletConnected) {
      setActionMessage({
        type: "warning",
        message: "Conectează MetaMask înainte de a te alătura unui meci.",
      });
      return;
    }

    try {
      setJoiningMatchId(match.id);
      setActionMessage(null);
      const { contract } = await getContract();
      const tx = await contract.joinMatch(match.id, {
        value: match.betAmountWei,
        gasLimit: 250_000,
      });
      await tx.wait();

      setActionMessage({
        type: "success",
        message: `Te-ai alăturat meciului #${match.id}. Succes!`,
      });
      window.dispatchEvent(new CustomEvent("matches:refresh"));
      setSelectedMatchId(match.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tranzacție eșuată.";
      setActionMessage({ type: "error", message: `Eroare la alăturare: ${message}` });
    } finally {
      setJoiningMatchId(null);
    }
  };

  const renderStatus = (match: Match) => {
    switch (match.state) {
      case MatchState.WaitingOpponent:
        return MATCH_STATE_LABELS[MatchState.WaitingOpponent];
      case MatchState.InProgress: {
        const turnLabel =
          match.currentTurn === ZERO_ADDRESS
            ? "-"
            : shortAddress(match.currentTurn);
        return `${MATCH_STATE_LABELS[MatchState.InProgress]} · Rând: ${turnLabel}`;
      }
      case MatchState.Finished:
        return MATCH_STATE_LABELS[MatchState.Finished];
      default:
        return "-";
    }
  };

  const renderWinner = (match: Match) => {
    if (match.state !== MatchState.Finished) return "—";
    if (match.winner === ZERO_ADDRESS) return "Egal";
    return shortAddress(match.winner);
  };

  if (!walletConnected) {
    return (
      <div className="matches-section">
        <div className="panel-header">
          <h2>Meciuri active</h2>
          <p>Conectează-ți portofelul pentru a vizualiza arena Tic-Tac-Toe.</p>
        </div>
        <p className="status-message status-message--warning">
          Conectează MetaMask pentru a vedea meciurile și a intra în joc.
        </p>
      </div>
    );
  }

  return (
    <div className="matches-section">
      <div className="panel-header">
        <h2>Meciuri active</h2>
        <p>
          Urmărește sesiunile existente și alătură-te celor care au nevoie de un adversar
          cu aceeași miză. Deschide tabla pentru a urmări mutările în timp real.
        </p>
      </div>

      {actionMessage && (
        <p className={`status-message status-message--${actionMessage.type}`} role="alert">
          {actionMessage.message}
        </p>
      )}

      {loading ? (
        <div className="skeleton skeleton--table">
          <span>Se incarca meciurile...</span>
        </div>
      ) : activeMatches.length === 0 ? (
        <div className="empty-state">
          <h3>Nu exista meciuri active</h3>
          <p>Fii primul care creeaza un meci si invita-ti prietenii la un Tic-Tac-Toe.</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="matches-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jucător 1</th>
                  <th>Jucător 2</th>
                  <th>Miza (ETH)</th>
                  <th>Mutări</th>
                  <th>Status</th>
                  <th>Câștigător</th>
                  <th>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {activeMatches.map((m) => {
                  const awaitingOpponent =
                    m.state === MatchState.WaitingOpponent &&
                    m.player2 === ZERO_ADDRESS;

                  return (
                    <tr key={m.id} onClick={() => setSelectedMatchId(m.id)}>
                      <td>{m.id}</td>
                      <td>{shortAddress(m.player1)}</td>
                      <td>
                        {m.player2 === ZERO_ADDRESS ? "—" : shortAddress(m.player2)}
                      </td>
                      <td>{m.betAmountEth}</td>
                      <td>{m.moves}</td>
                      <td>{renderStatus(m)}</td>
                      <td>{renderWinner(m)}</td>
                      <td>
                        <div className="action-stack">
                          {awaitingOpponent ? (
                            <button
                              type="button"
                              className="primary-button primary-button--compact"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJoin(m);
                              }}
                              disabled={joiningMatchId === m.id}
                            >
                              {joiningMatchId === m.id ? "Se confirmă..." : "Alătură-te"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMatchId(m.id);
                            }}
                          >
                            Deschide tabla
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedMatch && (
            <TicTacToeBoard
              match={selectedMatch}
              account={account}
              onClose={() => setSelectedMatchId(null)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MatchesList;
