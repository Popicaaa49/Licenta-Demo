export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export enum PolicyState {
  Offered = 0,
  Active = 1,
  Resolved = 2,
  Cancelled = 3,
}

export interface Policy {
  id: number;
  insurer: string;
  insured: string;
  coverageWei: bigint;
  coverageEth: string;
  premiumWei: bigint;
  premiumEth: string;
  durationSeconds: number;
  startTime: number;
  endTime: number;
  location: string;
  windSpeedKmh: number;
  state: PolicyState;
  eventOccurred: boolean;
}

export const POLICY_STATE_LABELS: Record<PolicyState, string> = {
  [PolicyState.Offered]: "Oferta deschisa",
  [PolicyState.Active]: "Activa",
  [PolicyState.Resolved]: "Rezolvata",
  [PolicyState.Cancelled]: "Anulata",
};
