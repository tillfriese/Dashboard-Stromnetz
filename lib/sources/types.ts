import type { SourceId } from "@/lib/settings";

/** Unified adapter output. `ts` is UTC epoch ms; `value` is never NaN (gaps are omitted). */
export type Observation = { seriesKey: string; ts: number; value: number };

export type SeriesDef = {
  key: string;
  source: SourceId;
  region: string;
  unit: string;
  label: string;
  color?: string;
  kind: "actual" | "forecast";
};

export type FetchContext = { signal?: AbortSignal };

export interface SourceAdapter {
  id: SourceId;
  /** Series this adapter can produce (registered in the `series` table). */
  series(): SeriesDef[];
  /** Fetches all observations in [from, to). */
  fetchRange(from: number, to: number, ctx?: FetchContext): Promise<Observation[]>;
  /** Earliest date worth backfilling (YYYY-MM-DD). */
  earliest: string;
}

export class SourceError extends Error {
  constructor(
    readonly source: SourceId,
    message: string,
  ) {
    super(`${source}: ${message}`);
  }
}
