import { getSetting, isSourceEnabled } from "@/lib/settings";
import { fetchFrequency } from "@/lib/sources/energy-charts";
import { fetchGridradarFrequency, RateLimitedError } from "@/lib/sources/gridradar";
import { FrequencyBuffer } from "./buffer";

/*
 * Polls the grid frequency every 5 s into an in-memory ring buffer (no database).
 * Primary: Gridradar (if a token is configured). On HTTP 429 it backs off for 60 s.
 * Fallback: Energy-Charts /v2/frequency (documented, ~1–2 min delay, polled every 10 s).
 */

type State = {
  buffer: FrequencyBuffer;
  source: "gridradar" | "energycharts" | null;
  lastError: string | null;
  gridradarBlockedUntil: number;
  lastEnergyChartsAt: number;
  timer?: NodeJS.Timeout;
  busy: boolean;
};

const g = globalThis as unknown as { netzlageFrequency?: State };

function state(): State {
  g.netzlageFrequency ??= {
    buffer: new FrequencyBuffer(),
    source: null,
    lastError: null,
    gridradarBlockedUntil: 0,
    lastEnergyChartsAt: 0,
    busy: false,
  };
  return g.netzlageFrequency;
}

export async function pollFrequencyOnce() {
  const s = state();
  if (s.busy) return;
  s.busy = true;
  try {
    const now = Date.now();
    const token = (await isSourceEnabled("gridradar")) ? await getSetting("gridradar.token") : null;
    if (token && now >= s.gridradarBlockedUntil) {
      try {
        s.buffer.add(await fetchGridradarFrequency(token));
        s.source = "gridradar";
        s.lastError = null;
        return;
      } catch (err) {
        s.lastError = (err as Error).message;
        if (err instanceof RateLimitedError) s.gridradarBlockedUntil = now + 60_000;
      }
    }
    if ((await isSourceEnabled("energycharts")) && now - s.lastEnergyChartsAt >= 10_000) {
      s.lastEnergyChartsAt = now;
      const since = s.buffer.latest()?.ts ?? now - 5 * 60_000;
      s.buffer.add(await fetchFrequency(Math.max(since, now - 10 * 60_000)));
      s.source = "energycharts";
      s.lastError = null;
    }
  } catch (err) {
    s.lastError = (err as Error).message;
  } finally {
    s.busy = false;
  }
}

export function startFrequencyPoller() {
  const s = state();
  if (s.timer) return;
  s.timer = setInterval(() => void pollFrequencyOnce(), 5_000);
  s.timer.unref();
  void pollFrequencyOnce();
}

/** Snapshot for /api/frequency: last 5 minutes. */
export function frequencySnapshot() {
  const s = state();
  return { source: s.source, lastError: s.lastError, latest: s.buffer.latest(), points: s.buffer.window(5 * 60_000) };
}
