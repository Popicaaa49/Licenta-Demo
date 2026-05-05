import { ClassifiedPayoutError } from "../types/payout";

const RETRYABLE_PATTERNS = [
  "timeout",
  "timed out",
  "network",
  "econnreset",
  "econnrefused",
  "429",
  "too many requests",
  "replacement transaction underpriced",
  "already known",
  "nonce too low",
  "temporarily unavailable",
];

const FATAL_PATTERNS = [
  "insufficient funds",
  "execution reverted",
  "call exception",
  "missing revert data",
  "invalid argument",
  "policy already paid",
];

const extractMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export class ErrorClassifier {
  classify(error: unknown): ClassifiedPayoutError {
    const message = extractMessage(error);
    const normalized = message.toLowerCase();

    if (RETRYABLE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
      return {
        kind: "retryable",
        code: "RETRYABLE_CHAIN_ERROR",
        message,
      };
    }

    if (FATAL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
      return {
        kind: "fatal",
        code: "FATAL_CHAIN_ERROR",
        message,
      };
    }

    return {
      kind: "fatal",
      code: "UNKNOWN_PAYOUT_ERROR",
      message,
    };
  }
}
