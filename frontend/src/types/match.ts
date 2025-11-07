export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export enum MatchState {
  WaitingOpponent = 0,
  InProgress = 1,
  Finished = 2,
}

export interface Match {
  id: number;
  player1: string;
  player2: string;
  betAmountWei: bigint;
  betAmountEth: string;
  state: MatchState;
  winner: string;
  currentTurn: string;
  moves: number;
  board: number[];
}

export const MATCH_STATE_LABELS: Record<MatchState, string> = {
  [MatchState.WaitingOpponent]: "Așteaptă adversar",
  [MatchState.InProgress]: "În desfășurare",
  [MatchState.Finished]: "Finalizat",
};
