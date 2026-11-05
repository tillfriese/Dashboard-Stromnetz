import { QUARTER_HOUR_MS } from "@/lib/time";

// Local copy: Turbopack does not rewrite an imported binding inside a for-loop update clause.
const STEP = QUARTER_HOUR_MS;

export type FlowSnapshot = { ts: number; flows: { country: string; mw: number }[]; netImportMW: number | null };

type Options = {
  /** Series key of a border flow (positive = import to Germany). */
  keyFor: (country: string) => string;
  /** Series with the net import; without it, the border flows are summed. */
  netKey?: string;
  /** A value also counts for later quarter hours up to this age (hourly series on the 15-min grid). */
  maxAgeMs: number;
  /** Quarter hours with more borders at exactly 0 count as incomplete (not yet reported). */
  maxZeros: number;
  lookbackMs: number;
};

function valueAt(series: Map<number, number> | undefined, ts: number, maxAgeMs: number): number | null {
  for (let t = ts; t > ts - maxAgeMs; t -= STEP) {
    const v = series?.get(t);
    if (v != null) return v;
  }
  return null;
}

/**
 * Newest quarter hour <= upper for which every border has a value, i.e. the newest complete
 * picture of the cross-border flows of one source.
 */
export function latestCompleteFlows(
  data: Map<string, Map<number, number>>,
  neighbours: readonly string[],
  upper: number,
  o: Options,
): FlowSnapshot | null {
  const start = Math.floor(upper / STEP) * STEP;
  for (let ts = start; ts > upper - o.lookbackMs; ts -= STEP) {
    const vals = neighbours.map((cc) => valueAt(data.get(o.keyFor(cc)), ts, o.maxAgeMs));
    if (vals.some((v) => v == null)) continue;
    if (vals.filter((v) => v === 0).length > o.maxZeros) continue;
    const flows = neighbours.map((country, i) => ({ country, mw: vals[i]! }));
    const netImportMW = o.netKey ? (data.get(o.netKey)?.get(ts) ?? null) : flows.reduce((a, f) => a + f.mw, 0);
    return { ts, flows, netImportMW };
  }
  return null;
}

/** The newer of two snapshots; on a tie the first (preferred) one. */
export function newerSnapshot<T extends { ts: number }>(preferred: T | null, other: T | null): T | null {
  if (!preferred) return other;
  if (!other) return preferred;
  return other.ts > preferred.ts ? other : preferred;
}
