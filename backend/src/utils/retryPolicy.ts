import { env } from "../config/env";

export class RetryPolicy {
  constructor(private readonly retryDelaysMs = env.payoutRetryDelaysMs) {}

  getNextRetryAt(attemptCount: number, now = new Date()) {
    const delay = this.retryDelaysMs[Math.max(0, attemptCount - 1)];
    if (delay === undefined) {
      return null;
    }

    return new Date(now.getTime() + delay);
  }
}
