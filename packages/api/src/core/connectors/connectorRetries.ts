import { setTimeout as sleep } from "node:timers/promises";

import { ConnectorError, type ConnectorErrorCode } from "./connector";

/**
 * Runs a connector call, trying it again after a rate-limited or unavailable answer, three attempts
 * in all, as connecting and scans both do; `onRetry` hears each failed attempt before the wait.
 */
export async function withConnectorRetries<T>(
  call: () => Promise<T>,
  {
    wait = sleep,
    onRetry,
  }: {
    /** Waits between attempts; tests pass one that does not wait. */
    wait?: (ms: number) => Promise<void>;
    onRetry: (failure: ConnectorErrorCode, attempt: number) => void;
  },
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const retried =
        error instanceof ConnectorError && RETRIED_CONNECTOR_ERRORS.includes(error.code);
      if (!retried || attempt === ATTEMPTS) {
        throw error;
      }
      onRetry(error.code, attempt);
      await wait(FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

/** Failures that pass on their own, so a call is tried again before it fails. */
const RETRIED_CONNECTOR_ERRORS: readonly ConnectorErrorCode[] = ["rate_limited", "app_unavailable"];

/** Three attempts in all for a rate-limited or unavailable call. */
const ATTEMPTS = 3;

/** The wait before the second attempt, doubled before each later one, as Google advises. */
const FIRST_RETRY_DELAY_MS = 1_000;
