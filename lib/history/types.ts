import type { Resolution } from "./query";

/** Sum and count of quarter-hour values per bucket (null = no data). */
export type Stat = [sum: number, count: number] | null;

export type SeriesBlock = {
  /** Bucket starts (UTC ms) and their Berlin-local labels ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"). */
  buckets: number[];
  labels: string[];
  series: Record<string, Stat[]>;
  /** Quarter hours that satisfy all conditions, per bucket (only with conditions). */
  matched: number[] | null;
};

export type TimeseriesResponse = {
  from: string;
  to: string;
  res: Resolution;
  coarsened: boolean;
  publicMode: boolean;
  main: SeriesBlock;
  compare: SeriesBlock | null;
  kpi: { negativePriceHours: number | null; matchedHours: number | null; totalHours: number };
  installed: { ts: number; values: Record<string, number | null> }[] | null;
};

export type HeatmapResponse = {
  metric: string;
  year: number;
  unit: string;
  /** values[hour][week] (week 1..53 as index 0..52) */
  values: (number | null)[][];
  min: number | null;
  max: number | null;
  availableYears: number[];
};
