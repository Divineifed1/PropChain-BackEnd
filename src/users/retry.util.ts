export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Delay before the first retry in ms; doubles each retry. Default 200. */
  baseDelayMs?: number;
  /** Ceiling on any single delay in ms. Default 2000. */
  maxDelayMs?: number;
  /** Return false to stop retrying immediately. Default: retry everything. */
  isRetryable?: (error: unknown) => boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; returns a value in [0, 1). */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Delay before retry number `retry` (1-based): exponential, capped, with up to 50% jitter. */
export function backoffDelayMs(retry: number, baseDelayMs: number, maxDelayMs: number, random: () => number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (retry - 1));
  return Math.round(exponential * (0.5 + random() * 0.5));
}

/**
 * Run `fn`, retrying failures with exponential backoff and jitter. The last
 * error is rethrown once attempts run out or `isRetryable` says to stop.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 2_000,
    isRetryable = () => true,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryable(error)) break;
      await sleep(backoffDelayMs(attempt, baseDelayMs, maxDelayMs, random));
    }
  }
  throw lastError;
}
