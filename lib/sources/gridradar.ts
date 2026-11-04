import { fetchWithRetry } from "@/lib/http";
import { SourceError } from "./types";

/*
 * Gridradar API (token required), documented at service.gridradar.net (login).
 *   POST https://api.gridradar.net/query  with "Authorization: Bearer <token>"
 *   body: { metric: "frequency-ucte-median-1s", format: "json", ts: "rfc3339", aggr: "1s" }
 * Free accounts may only query this metric without from/to; the start is derived from the
 * previous response and limits are stricter (HTTP 429 when exceeded).
 * The JSON output is Grafana compatible: [{ target, datapoints: [[value, time], ...] }].
 * NOTE: parsing is defensive because no recorded response was available (no token).
 */

export class RateLimitedError extends SourceError {
  constructor() {
    super("gridradar", "rate limit (HTTP 429)");
  }
}

export function parseGridradar(json: unknown): { ts: number; hz: number }[] {
  const series = Array.isArray(json) ? json : [json];
  const out: { ts: number; hz: number }[] = [];
  for (const s of series as { datapoints?: unknown[] }[]) {
    for (const p of s?.datapoints ?? []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const [v, t] = p as [unknown, unknown];
      const hz = Number(v);
      const ts = typeof t === "number" ? (t < 1e12 ? t * 1000 : t) : Date.parse(String(t));
      if (Number.isFinite(hz) && Number.isFinite(ts)) out.push({ ts, hz });
    }
  }
  if (out.length === 0 && !Array.isArray(json)) throw new SourceError("gridradar", "unexpected response format");
  return out.sort((a, b) => a.ts - b.ts);
}

export async function fetchGridradarFrequency(token: string, signal?: AbortSignal) {
  const res = await fetchWithRetry("https://api.gridradar.net/query", {
    method: "POST",
    retries: 0,
    timeoutMs: 8_000,
    minIntervalMs: 0,
    signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ metric: "frequency-ucte-median-1s", format: "json", ts: "rfc3339", aggr: "1s" }),
  });
  if (res.status === 429) throw new RateLimitedError();
  if (res.status === 401) throw new SourceError("gridradar", "Token ungültig (HTTP 401)");
  if (!res.ok) throw new SourceError("gridradar", `HTTP ${res.status}`);
  return parseGridradar(await res.json());
}
