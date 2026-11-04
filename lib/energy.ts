import type { CarrierKey } from "./carriers";

/*
 * Mapping of SMARD generation series to the nine display carriers, renewable flags and
 * CO2 emission factors.
 *
 * CO2 factors: direct CO2 emissions per kWh of electricity, without upstream chain.
 * Source: Umweltbundesamt, "Entwicklung der spezifischen Treibhausgas-Emissionen des deutschen
 * Strommix in den Jahren 1990–2024", Climate Change 13/2025, Tabelle 4 (S. 23):
 *   Braunkohle 1.119 g/kWh, Steinkohle 860 g/kWh, Erdgas 392 g/kWh (Bezug Stromverbrauch, 2024, vorläufig).
 * "Sonstige Konventionelle" (Öl, fossiler Abfall, Gicht-/Kokereigase) has no UBA value; we estimate
 * 800 g/kWh from the ZSE factor for heavy fuel oil (79.587 kg CO2/TJ ≈ 287 g/kWh fuel, Anhang 3)
 * at an assumed net efficiency of 36 % – an own approximation, clearly not an official figure.
 * Nuclear, renewables and pumped storage count as 0 g/kWh direct emissions (pumped storage only
 * re-releases stored energy; counting it would double-count). Biomass CO2 is biogenic and, as in
 * the UBA inventory, not counted as direct fossil CO2.
 * The intensity is computed relative to domestic generation (not consumption incl. trade), so
 * it is not directly comparable with UBA's consumption-based annual value (363 g/kWh for 2024).
 */
export const CO2_G_PER_KWH: Record<string, number> = {
  lignite: 1119,
  hardcoal: 860,
  gas: 392,
  other_conventional: 800,
  nuclear: 0,
  hydro: 0,
  pumped_storage: 0,
  biomass: 0,
  wind_onshore: 0,
  wind_offshore: 0,
  solar: 0,
  other_renewable: 0,
};

/** SMARD generation metrics -> display carrier. */
export const METRIC_TO_CARRIER: Record<string, CarrierKey> = {
  hydro: "hydro",
  biomass: "biomass",
  wind_onshore: "wind",
  wind_offshore: "wind",
  solar: "solar",
  lignite: "lignite",
  hardcoal: "hardcoal",
  gas: "gas",
  nuclear: "nuclear",
  other_conventional: "other",
  other_renewable: "other",
  pumped_storage: "other",
};

export const GENERATION_METRICS = Object.keys(METRIC_TO_CARRIER);
export const RENEWABLE_METRICS = ["hydro", "biomass", "wind_onshore", "wind_offshore", "solar", "other_renewable"];

/** Generation values of one quarter hour, keyed by SMARD metric (MW). Missing metrics = unknown. */
export type GenerationSnapshot = Partial<Record<string, number>>;

export function totalGeneration(g: GenerationSnapshot): number {
  return GENERATION_METRICS.reduce((a, m) => a + (g[m] ?? 0), 0);
}

/** Renewable share of generation in percent. */
export function renewableShare(g: GenerationSnapshot): number | null {
  const total = totalGeneration(g);
  if (total <= 0) return null;
  return (RENEWABLE_METRICS.reduce((a, m) => a + (g[m] ?? 0), 0) / total) * 100;
}

/** CO2 intensity of generation in g/kWh (= t/MWh * 1000). */
export function co2Intensity(g: GenerationSnapshot): number | null {
  const total = totalGeneration(g);
  if (total <= 0) return null;
  const emissions = GENERATION_METRICS.reduce((a, m) => a + (g[m] ?? 0) * (CO2_G_PER_KWH[m] ?? 0), 0);
  return emissions / total;
}

/** Aggregates metrics into the nine display carriers (fixed order, MW). */
export function byCarrier(g: GenerationSnapshot): Record<CarrierKey, number> {
  const out = { hydro: 0, biomass: 0, wind: 0, solar: 0, lignite: 0, hardcoal: 0, gas: 0, nuclear: 0, other: 0 } as Record<CarrierKey, number>;
  for (const [metric, carrier] of Object.entries(METRIC_TO_CARRIER)) out[carrier] += g[metric] ?? 0;
  return out;
}

/** Whether a snapshot contains enough metrics to be meaningful (all major carriers present). */
export function isComplete(g: GenerationSnapshot): boolean {
  return ["wind_onshore", "solar", "lignite", "hardcoal", "gas", "biomass", "hydro"].every((m) => g[m] != null);
}
