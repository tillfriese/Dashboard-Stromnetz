import type { SourceId } from "@/lib/settings";
import { energyChartsAdapter } from "./energy-charts";
import { entsoeAdapter } from "./entsoe";
import { smardAdapter } from "./smard";
import { stromGedachtAdapter } from "./stromgedacht";
import type { SourceAdapter } from "./types";

/** Sources that write to the database (Gridradar only feeds the in-memory frequency buffer). */
export const ADAPTERS = {
  smard: smardAdapter,
  energycharts: energyChartsAdapter,
  entsoe: entsoeAdapter,
  stromgedacht: stromGedachtAdapter,
} satisfies Partial<Record<SourceId, SourceAdapter>>;

export type StoredSourceId = keyof typeof ADAPTERS;
export const STORED_SOURCES = Object.keys(ADAPTERS) as StoredSourceId[];

export function allSeriesDefs() {
  return Object.values(ADAPTERS).flatMap((a) => a.series());
}
