import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import { getContract } from "../web3Config";
import { Match, MatchState, MATCH_STATE_LABELS, ZERO_ADDRESS } from "../types/match";

interface TicTacToeBoardProps {
  match: Match;
  account: string | null;
  onClose: () => void;
}

type BoardStatus =
  | { type: "info" | "success"; message: string }
  | { type: "error"; message: string };

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(address.length - 4)}`;

const symbolForValue = (value: number) => {
  if (value === 1) return "X";
  if (value === 2) return "O";
  return "";
};

const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({ match, account, onClose }) => {
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [status, setStatus] = useState<BoardStatus | null>(null);

  const lowerAccount = account?.toLowerCase() ?? null;
  const player1Lower = match.player1.toLowerCase();
  const player2Lower = match.player2.toLowerCase();

  const isParticipant =
    lowerAccount !== null &&
    (lowerAccount === player1Lower || lowerAccount === player2Lower);

  const accountMark = useMemo(() => {
    if (!isParticipant || !lowerAccount) return null;
    return lowerAccount === player1Lower ? "X" : "O";
  }, [isParticipant, lowerAccount, player1Lower]);

  const canMove =
    match.state === MatchState.InProgress &&
    isParticipant &&
    lowerAccount === match.currentTurn.toLowerCase();

  const turnDisplay =
    match.currentTurn === ZERO_ADDRESS ? "—" : shortAddress(match.currentTurn);

  const totalPotWei =
    match.player2 === ZERO_ADDRESS && match.state === MatchState.WaitingOpponent
      ? match.betAmountWei
      : match.betAmountWei * BigInt(2);

  const finalOutcomeMessage = useMemo(() => {
    if (match.state !== MatchState.Finished) return null;
    if (match.winner === ZERO_ADDRESS) {
      return "Rezultat: egalitate. Mizele au fost returnate jucătorilor.";
    }
    return `Câștigător: ${shortAddress(
      match.winner
    )} · Pot câștigat ${ethers.formatEther(match.betAmountWei * BigInt(2))} ETH`;
  }, [match]);

  const handleCellClick = async (index: number) => {
    if (!canMove) {
      setStatus({
        type: "error",
        message: "Nu este rândul tău sau meciul nu mai este activ.",
      });
      return;
    }

    if (match.board[index] !== 0) {
      setStatus({ type: "error", message: "Caseta este deja ocupată." });
      return;
    }

    try {
      setPendingCell(index);
      setStatus({ type: "info", message: "Trimit mutarea către blockchain..." });

      const { contract } = await getContract();
      const tx = await contract.makeMove(match.id, index, {
        gasLimit: 250_000,
      });
      await tx.wait();

      setStatus({
        type: "success",
        message: "Mutarea a fost confirmată. Așteaptă rândul adversarului.",
      });
      window.dispatchEvent(new CustomEvent("matches:refresh"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Mutarea a eșuat. Încearcă din nou.";
      setStatus({ type: "error", message });
    } finally {
      setPendingCell(null);
    }
  };

  return (
    <div className="board-panel">
      <div className="board-header">
        <div>
          <h3>Meci #{match.id}</h3>
          <p>
            Miza per jucător: <strong>{match.betAmountEth} ETH</strong> · Pot total:{" "}
            <strong>{ethers.formatEther(totalPotWei)} ETH</strong>
          </p>
        </div>
        <button type="button" className="tertiary-button" onClick={onClose}>
          Închide
        </button>
      </div>

      <div className="board-meta">
        <div>
          <span className="board-badge board-badge--x">X</span> {shortAddress(match.player1)}
        </div>
        <div>
          <span className="board-badge board-badge--o">O</span>{" "}
          {match.player2 === ZERO_ADDRESS ? "—" : shortAddress(match.player2)}
        </div>
        <div>
          {match.state === MatchState.InProgress
            ? `Rând curent: ${turnDisplay}`
            : MATCH_STATE_LABELS[match.state]}
        </div>
        {account ? (
          <div>
            Tu joci cu:{" "}
            <strong>{accountMark ?? "spectator (trebuie să intri într-un meci)"}</strong>
          </div>
        ) : (
          <div>
            <strong>Conectează-ți portofelul pentru a face mutări.</strong>
          </div>
        )}
      </div>

      <div className="board-grid">
        {match.board.map((value, index) => {
          const symbol = symbolForValue(value);
          const isDisabled = value !== 0 || !canMove || pendingCell !== null;

          return (
            <button
              key={index}
              type="button"
              className={`board-cell ${symbol ? "board-cell--filled" : ""} ${
                !symbol && !isDisabled ? "board-cell--active" : ""
              }`}
              disabled={isDisabled}
              onClick={() => handleCellClick(index)}
            >
              {symbol || (pendingCell === index ? "…" : "")}
            </button>
          );
        })}
      </div>

      {status && (
        <p className={`status-message board-status board-status--${status.type}`}>
          {status.message}
        </p>
      )}

      {finalOutcomeMessage && (
        <p className="status-message status-message--success">{finalOutcomeMessage}</p>
      )}
    </div>
  );
};

export default TicTacToeBoard;
