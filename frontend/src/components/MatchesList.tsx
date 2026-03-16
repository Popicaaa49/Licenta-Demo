import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ethers } from "ethers";
import { getContract, getReadGameContract } from "../web3Config";
import TicTacToeBoard from "./TicTacToeBoard";
import {
  Match,
  MatchState,
  MATCH_STATE_LABELS,
  ZERO_ADDRESS,
} from "../types/match";

type StatusPayload = { type: "success" | "error" | "warning"; message: string };
type ToastKind = "info" | "success" | "warning";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
  actionLabel?: string;
  actionMatchId?: number;
};

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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  const lastTurnByMatchRef = useRef<Record<number, string>>({});
  const lastActiveMatchIdRef = useRef<number | null>(null);
  const dismissedActiveMatchIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const didDragRef = useRef(false);

  const accountLower = useMemo(() => account?.toLowerCase() ?? null, [account]);

  const activeMatches = useMemo(
    () => matches.filter((m) => m.state !== MatchState.Finished),
    [matches]
  );

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );
  const isModalOpen = selectedMatchId !== null;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  const pushToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => {
      if (prev.some((item) => item.id === toast.id)) {
        return prev;
      }
      return [toast, ...prev].slice(0, 3);
    });
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== toastId));
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (err) {
      console.warn("Unable to request notification permission", err);
    }
  }, []);

  const playTurnSound = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as Window & { webkitAudioContext?: typeof AudioContext }
        ).webkitAudioContext;
      if (!AudioContextClass) return;

      const context =
        audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;

      if (context.state === "suspended") {
        void context.resume();
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = 720;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.36);
    } catch (err) {
      console.warn("Unable to play turn sound", err);
    }
  }, []);

  const notifyActiveMatch = useCallback(
    (match: Match) => {
      if (dismissedActiveMatchIdRef.current === match.id) return;
      pushToast({
        id: `active-${match.id}`,
        kind: "info",
        title: "Meci activ gasit",
        message: `Ai un meci in desfasurare (#${match.id}).`,
        actionLabel: "View",
        actionMatchId: match.id,
      });
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          const notification = new Notification("Meciul a inceput", {
            body: `Meciul #${match.id} este activ. Apasa View in aplicatie.`,
            icon: "/logo192.png",
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      }
    },
    [pushToast]
  );

  const notifyYourTurn = useCallback(
    (match: Match) => {
      pushToast({
        id: `turn-${match.id}-${match.moves}`,
        kind: "success",
        title: "Este randul tau",
        message: `Meciul #${match.id} asteapta mutarea ta.`,
        actionLabel: "View",
        actionMatchId: match.id,
      });
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          const notification = new Notification("Este randul tau", {
            body: `Meciul #${match.id} asteapta mutarea ta.`,
            icon: "/logo192.png",
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      }
      playTurnSound();
    },
    [pushToast, playTurnSound]
  );

  const clampModalPosition = useCallback((x: number, y: number) => {
    const modal = modalRef.current;
    if (!modal) {
      return { x, y };
    }

    const rect = modal.getBoundingClientRect();
    const padding = 16;
    const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxY = Math.max(padding, window.innerHeight - rect.height - padding);

    return {
      x: Math.min(Math.max(x, padding), maxX),
      y: Math.min(Math.max(y, padding), maxY),
    };
  }, []);

  const startDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const modal = modalRef.current;
    if (!modal) return;

    const rect = modal.getBoundingClientRect();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    };
    didDragRef.current = false;
    setModalPosition((prev) => prev ?? { x: rect.left, y: rect.top });
    setIsDragging(true);
  }, []);

  const openMatch = useCallback((matchId: number) => {
    dismissedActiveMatchIdRef.current = matchId;
    setSelectedMatchId(matchId);
    setModalPosition(null);
    setIsDragging(false);
    dragStateRef.current = null;
    didDragRef.current = false;
    setToasts((prev) => prev.filter((item) => item.actionMatchId !== matchId));
  }, []);

  const closeMatch = useCallback(() => {
    setSelectedMatchId(null);
    setModalPosition(null);
    setIsDragging(false);
    dragStateRef.current = null;
    didDragRef.current = false;
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    if (typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    const originalPadding = document.body.style.paddingRight;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;
    if (!modalRef.current) return;
    if (!modalPosition) {
      const rect = modalRef.current.getBoundingClientRect();
      const centerX = (window.innerWidth - rect.width) / 2;
      const centerY = (window.innerHeight - rect.height) / 2;
      setModalPosition(clampModalPosition(centerX, centerY));
      return;
    }

    const clamped = clampModalPosition(modalPosition.x, modalPosition.y);
    if (clamped.x !== modalPosition.x || clamped.y !== modalPosition.y) {
      setModalPosition(clamped);
    }
  }, [clampModalPosition, isModalOpen, modalPosition]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal || !isModalOpen) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!modalPosition) return;
      const rect = modal.getBoundingClientRect();
      const clamped = clampModalPosition(rect.left, rect.top);
      if (clamped.x !== rect.left || clamped.y !== rect.top) {
        setModalPosition(clamped);
      }
    });

    observer.observe(modal);

    return () => observer.disconnect();
  }, [clampModalPosition, isModalOpen, modalPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragState.moved = true;
        didDragRef.current = true;
      }

      const nextX = dragState.originX + deltaX;
      const nextY = dragState.originY + deltaY;
      setModalPosition(clampModalPosition(nextX, nextY));
    };

    const handleUp = () => {
      setIsDragging(false);
      dragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [clampModalPosition, isDragging]);

  const fetchMatches = useCallback(async () => {
    if (!walletConnected) {
      setMatches([]);
      setLoading(false);
      hasLoadedOnceRef.current = false;
      return;
    }

    const showLoading = !hasLoadedOnceRef.current;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const { contract } = await getReadGameContract();
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

      if (accountLower) {
        const active = formatted.find(
          (m) =>
            (m.player1.toLowerCase() === accountLower ||
              m.player2.toLowerCase() === accountLower) &&
            m.state === MatchState.InProgress
        );

        if (active) {
          if (active.id !== lastActiveMatchIdRef.current) {
            lastActiveMatchIdRef.current = active.id;
            if (active.id !== selectedMatchId) {
              notifyActiveMatch(active);
            }
          }
        } else {
          lastActiveMatchIdRef.current = null;
        }

        const turnMap = lastTurnByMatchRef.current;
        formatted.forEach((m) => {
          const isParticipant =
            m.player1.toLowerCase() === accountLower ||
            m.player2.toLowerCase() === accountLower;

          if (!isParticipant || m.state !== MatchState.InProgress) {
            delete turnMap[m.id];
            return;
          }

          const currentTurn = m.currentTurn.toLowerCase();
          const previousTurn = turnMap[m.id];
          turnMap[m.id] = currentTurn;

          if (currentTurn === accountLower && previousTurn !== accountLower) {
            notifyYourTurn(m);
          }
        });
      }
    } catch (err) {
      console.error("Error fetching matches:", err);
      setActionMessage({
        type: "error",
        message: "Nu am putut încărca meciurile. Verifică conexiunea la rețea.",
      });
    } finally {
      if (showLoading) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [accountLower, notifyActiveMatch, notifyYourTurn, selectedMatchId, walletConnected]);

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
    lastTurnByMatchRef.current = {};
    lastActiveMatchIdRef.current = null;
    dismissedActiveMatchIdRef.current = null;
    setToasts([]);
  }, [accountLower]);

  useEffect(() => {
    if (!walletConnected) return;

    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { contract } = await getReadGameContract();

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

  useEffect(() => {
    if (!walletConnected) return;
    const intervalId = window.setInterval(() => {
      fetchMatches();
    }, 800);

    return () => window.clearInterval(intervalId);
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
      openMatch(match.id);
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

      <div className="notify-row">
        <div className="notify-row__text">
          <strong>Notificari desktop</strong>
          <span>Primesti alerta cand e randul tau.</span>
        </div>
        {notificationPermission === "granted" ? (
          <span className="notify-pill notify-pill--active">Activ</span>
        ) : notificationPermission === "denied" ? (
          <span className="notify-pill notify-pill--muted">Blocat</span>
        ) : notificationPermission === "unsupported" ? (
          <span className="notify-pill notify-pill--muted">Indisponibil</span>
        ) : (
          <button
            type="button"
            className="secondary-button primary-button--compact"
            onClick={requestNotificationPermission}
          >
            Activeaza
          </button>
        )}
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
                  const isYourTurn =
                    accountLower !== null &&
                    m.state === MatchState.InProgress &&
                    m.currentTurn.toLowerCase() === accountLower;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => openMatch(m.id)}
                      className={isYourTurn ? "match-row match-row--your-turn" : "match-row"}
                    >
                      <td>{m.id}</td>
                      <td>{shortAddress(m.player1)}</td>
                      <td>
                        {m.player2 === ZERO_ADDRESS ? "—" : shortAddress(m.player2)}
                      </td>
                      <td>{m.betAmountEth}</td>
                      <td>{m.moves}</td>
                      <td>
                        <div className="status-stack">
                          <span>{renderStatus(m)}</span>
                          {isYourTurn ? (
                            <span className="turn-pill">Randul tau</span>
                          ) : null}
                        </div>
                      </td>
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
                              openMatch(m.id);
                            }}
                          >
                            Vezi meciul
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isModalOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                className="game-modal-overlay"
                role="dialog"
                aria-modal="true"
                onClick={() => {
                  if (didDragRef.current) {
                    didDragRef.current = false;
                    return;
                  }
                  closeMatch();
                }}
              >
                <div
                  ref={modalRef}
                  className={`game-modal ${
                    modalPosition ? "game-modal--floating" : ""
                  } ${isDragging ? "game-modal--dragging" : ""}`}
                  style={
                    modalPosition ? { left: modalPosition.x, top: modalPosition.y } : undefined
                  }
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="game-modal__header" onMouseDown={startDrag}>
                    <div>
                      <h3>Meci #{selectedMatchId}</h3>
                      <p>Fereastra dedicata pentru jocul curent.</p>
                    </div>
                    <button
                      type="button"
                      className="tertiary-button"
                      onClick={closeMatch}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      Inchide
                    </button>
                  </div>
                  <div className="game-modal__body">
                    {selectedMatch ? (
                      <TicTacToeBoard
                        match={selectedMatch}
                        account={account}
                        onClose={closeMatch}
                        layout="modal"
                        showClose={false}
                      />
                    ) : (
                      <div className="skeleton">
                        <span>Se incarca meciul...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )}
        </>
      )}

      {toasts.length > 0 ? (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.kind}`}>
              <div className="toast__content">
                <strong>{toast.title}</strong>
                <span>{toast.message}</span>
              </div>
              <div className="toast__actions">
                {toast.actionMatchId !== undefined ? (
                  <button
                    type="button"
                    className="primary-button primary-button--compact"
                    onClick={() => {
                      const matchId = toast.actionMatchId;
                      if (matchId === undefined) {
                        return;
                      }
                      openMatch(matchId);
                      dismissToast(toast.id);
                    }}
                  >
                    {toast.actionLabel ?? "View"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    if (
                      toast.id.startsWith("active-") &&
                      toast.actionMatchId !== undefined
                    ) {
                      dismissedActiveMatchIdRef.current = toast.actionMatchId;
                    }
                    dismissToast(toast.id);
                  }}
                >
                  Inchide
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default MatchesList;
