import { setTimeout as sleep } from "node:timers/promises";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    url: string,
  ) {
    super(`HTTP ${status} for ${redact(url)}`);
  }
}

/** Removes credentials from URLs before they end up in logs or error messages. */
export function redact(url: string): string {
  return url.replace(/(securityToken|token)=[^&]+/gi, "$1=***");
}

const lastRequestAt = new Map<string, number>();

export type FetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  /** Minimum spacing between requests to the same host (polite rate limit). */
  minIntervalMs?: number;
};

/**
 * fetch with timeout, retry with exponential backoff (for network errors, 429 and 5xx)
 * and a per-host minimum request interval.
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, retries = 3, minIntervalMs = 250, signal, ...init } = opts;
  const host = new URL(url).host;

  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const wait = (lastRequestAt.get(host) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait, undefined, { signal: signal ?? undefined });
    lastRequestAt.set(host, Date.now());

    try {
      const res = await fetch(url, {
        ...init,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "Netzlage/1.0 (university project)", ...init.headers },
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt), undefined, {
        signal: signal ?? undefined,
      });
    } catch (err) {
      if (signal?.aborted || attempt >= retries) throw err;
      await sleep(backoff(attempt), undefined, { signal: signal ?? undefined });
    }
  }
}

function backoff(attempt: number) {
  return Math.min(30_000, 1_000 * 2 ** attempt) + Math.random() * 250;
}
