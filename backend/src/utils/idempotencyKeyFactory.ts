export class IdempotencyKeyFactory {
  buildForSnapshot(policyId: number, snapshotId: number) {
    return `payout:policy:${policyId}:snapshot:${snapshotId}`;
  }
}
