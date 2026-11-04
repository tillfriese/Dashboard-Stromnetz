import { CARRIERS, type CarrierKey, NEIGHBOURS } from "@/lib/carriers";
import { byCarrier, co2Intensity, GENERATION_METRICS, type GenerationSnapshot, isComplete, renewableShare, totalGeneration } from "@/lib/energy";
import { isPublicMode } from "@/lib/settings";
import { flowKey, NET_IMPORT_KEY } from "@/lib/sources/energy-charts";
import { smardSeriesKey } from "@/lib/sources/smard";
import { addBerlinDays, QUARTER_HOUR_MS, startOfBerlinDay } from "@/lib/time";
import { freshnessBySource, latestTimestamps, loadSeries } from "./series";

export const ZONES = [
  { key: "TenneT", states: ["SH", "NI", "HB", "HE", "BY"] },
  { key: "50Hertz", states: ["MV", "BB", "BE", "HH", "ST", "SN", "TH"] },
  { key: "Amprion", states: ["NW", "RP", "SL"] },
  { key: "TransnetBW", states: ["BW"] },
] as const;
export type ZoneKey = (typeof ZONES)[number]["key"];

const REGIONS = ["DE", ...ZONES.map((z) => z.key)] as const;

export type CarrierValue = { carrier: CarrierKey; mw: number };
export type ZoneNow = {
  key: ZoneKey;
  states: readonly string[];
  generationMW: number;
  loadMW: number | null;
  balanceMW: number | null;
  mix: CarrierValue[];
  top3: { carrier: CarrierKey; share: number }[];
};

export type NowData = {
  hasData: boolean;
  asOf: number | null;
  kpis: { generationMW: number | null; loadMW: number | null; netImportMW: number | null; residualMW: number | null };
  renewable: { share: number | null; yesterday: number | null };
  co2: { now: number | null; todayMin: number | null; todayMax: number | null };
  mix: CarrierValue[];
  zones: ZoneNow[];
  flows: { country: string; mw: number }[];
  flowsAsOf: number | null;
  freshness: Record<string, number | null>;
  publicMode: boolean;
};

const genKeys = (region: string) => GENERATION_METRICS.map((m) => smardSeriesKey(m, region));

function snapshot(data: Map<string, Map<number, number>>, region: string, ts: number): GenerationSnapshot {
  const out: GenerationSnapshot = {};
  for (const m of GENERATION_METRICS) {
    const v = data.get(smardSeriesKey(m, region))?.get(ts);
    if (v != null) out[m] = v;
  }
  return out;
}

const mixList = (g: GenerationSnapshot): CarrierValue[] => {
  const c = byCarrier(g);
  return CARRIERS.map((x) => ({ carrier: x.key, mw: c[x.key] }));
};

/**
 * Latest complete quarter hour: the newest timestamp for which Germany's grid load and all
 * major generation carriers are present (carriers arrive with slightly different delays).
 */
export async function latestCompleteQuarter(): Promise<number | null> {
  const keys = [smardSeriesKey("load", "DE"), ...genKeys("DE")];
  const latest = await latestTimestamps(keys);
  const loadTs = latest.get(smardSeriesKey("load", "DE"));
  if (loadTs == null) return null;
  const data = await loadSeries(keys, loadTs - 6 * 3600_000, loadTs + 1);
  for (let ts = loadTs; ts > loadTs - 6 * 3600_000; ts -= QUARTER_HOUR_MS) {
    if (isComplete(snapshot(data, "DE", ts)) && data.get(smardSeriesKey("load", "DE"))?.has(ts)) return ts;
  }
  return null;
}

export async function getNowData(): Promise<NowData> {
  const [asOf, freshness, publicMode] = await Promise.all([latestCompleteQuarter(), freshnessBySource(), isPublicMode()]);
  const empty: NowData = {
    hasData: false,
    asOf: null,
    kpis: { generationMW: null, loadMW: null, netImportMW: null, residualMW: null },
    renewable: { share: null, yesterday: null },
    co2: { now: null, todayMin: null, todayMax: null },
    mix: [],
    zones: [],
    flows: [],
    flowsAsOf: null,
    freshness,
    publicMode,
  };
  if (asOf == null) return empty;

  const yesterday = addBerlinDays(asOf, -1);
  const dayStart = startOfBerlinDay(asOf);
  const keys = [
    ...REGIONS.flatMap((r) => [...genKeys(r), smardSeriesKey("load", r), smardSeriesKey("residual_load", r)]),
  ];
  const [data, prev] = await Promise.all([
    loadSeries(keys, Math.min(dayStart, asOf), asOf + 1),
    loadSeries(genKeys("DE"), yesterday, yesterday + 1),
  ]);

  const de = snapshot(data, "DE", asOf);
  const load = data.get(smardSeriesKey("load", "DE"))?.get(asOf) ?? null;
  const residual = data.get(smardSeriesKey("residual_load", "DE"))?.get(asOf) ?? null;

  // CO2 range over today's complete quarter hours.
  const co2Today: number[] = [];
  for (let ts = dayStart; ts <= asOf; ts += QUARTER_HOUR_MS) {
    const s = snapshot(data, "DE", ts);
    const v = isComplete(s) ? co2Intensity(s) : null;
    if (v != null) co2Today.push(v);
  }

  const zones: ZoneNow[] = ZONES.map((z) => {
    const g = snapshot(data, z.key, asOf);
    const gen = totalGeneration(g);
    const zl = data.get(smardSeriesKey("load", z.key))?.get(asOf) ?? null;
    const mix = mixList(g);
    return {
      key: z.key,
      states: z.states,
      generationMW: gen,
      loadMW: zl,
      balanceMW: zl == null ? null : gen - zl,
      mix,
      top3: [...mix]
        .sort((a, b) => b.mw - a.mw)
        .slice(0, 3)
        .filter((x) => x.mw > 0)
        .map((x) => ({ carrier: x.carrier, share: gen > 0 ? (x.mw / gen) * 100 : 0 })),
    };
  });

  // Cross-border flows (Energy-Charts, several hours delayed). The newest quarter hour is often
  // still incomplete (not yet reported borders appear as exactly 0), so we take the newest
  // quarter hour <= asOf in which at most one border reports exactly 0.
  const flowKeys = [...NEIGHBOURS.map(flowKey), NET_IMPORT_KEY];
  const flowLatest = await latestTimestamps(flowKeys);
  const newestFlow = flowLatest.get(NET_IMPORT_KEY);
  let flowTs: number | null = null;
  let flowData = new Map<string, Map<number, number>>();
  if (newestFlow != null) {
    const upper = Math.min(asOf, newestFlow);
    flowData = await loadSeries(flowKeys, upper - 12 * 3600_000, upper + 1);
    for (let ts = upper; ts > upper - 12 * 3600_000; ts -= QUARTER_HOUR_MS) {
      const vals = NEIGHBOURS.map((cc) => flowData.get(flowKey(cc))?.get(ts));
      if (vals.some((v) => v == null)) continue;
      if (vals.filter((v) => v === 0).length <= 1) {
        flowTs = ts;
        break;
      }
    }
  }
  const flows = NEIGHBOURS.flatMap((cc) => {
    const v = flowData.get(flowKey(cc))?.get(flowTs ?? -1);
    return v == null ? [] : [{ country: cc, mw: v }];
  });
  const netImport = flowData.get(NET_IMPORT_KEY)?.get(flowTs ?? -1) ?? null;

  return {
    hasData: true,
    asOf,
    kpis: {
      generationMW: totalGeneration(de),
      loadMW: load,
      netImportMW: netImport,
      residualMW: residual,
    },
    renewable: { share: renewableShare(de), yesterday: isComplete(snapshot(prev, "DE", yesterday)) ? renewableShare(snapshot(prev, "DE", yesterday)) : null },
    co2: {
      now: co2Intensity(de),
      todayMin: co2Today.length ? Math.min(...co2Today) : null,
      todayMax: co2Today.length ? Math.max(...co2Today) : null,
    },
    mix: mixList(de),
    zones,
    flows,
    flowsAsOf: flowTs,
    freshness,
    publicMode,
  };
}
