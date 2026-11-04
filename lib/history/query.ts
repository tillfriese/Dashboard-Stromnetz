/*
 * The complete filter state of the "Historie" page. It lives in the URL (search params), so
 * every view can be shared. This module is shared by server and client (no server imports).
 */
import { addDays, addMonths, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";
import { CARRIERS, type CarrierKey, NEIGHBOURS } from "@/lib/carriers";

export const RESOLUTIONS = ["15min", "hour", "day", "week", "month", "year"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const RESOLUTION_LABEL: Record<Resolution, string> = {
  "15min": "15 min",
  hour: "Stunde",
  day: "Tag",
  week: "Woche",
  month: "Monat",
  year: "Jahr",
};
/** Approximate bucket length in days, for point-count estimates. */
const RES_DAYS: Record<Resolution, number> = { "15min": 1 / 96, hour: 1 / 24, day: 1, week: 7, month: 30.44, year: 365.25 };

export const METRICS = ["load", "residual", "price", "co2", "netImport", "installed"] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABEL: Record<Metric, string> = {
  load: "Netzlast",
  residual: "Residuallast",
  price: "Day-Ahead-Preis",
  co2: "CO₂-Intensität",
  netImport: "Import/Export-Saldo",
  installed: "Installierte Leistung",
};

export const CHART_TYPES = ["stacked", "percent", "lines"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const HEAT_METRICS = ["residual", "solar", "wind", "price", "co2"] as const;
export type HeatMetric = (typeof HEAT_METRICS)[number];

export const MAX_POINTS = 5000;
export const DATA_START = "2015-01-01";

/* ---------- Conditions (AND-combined, evaluated per quarter hour) ---------- */

export const COND_OPS = { lt: "<", le: "≤", gt: ">", ge: "≥" } as const;
export type CondOp = keyof typeof COND_OPS;
export const VALUE_CONDITIONS = {
  price: { label: "Day-Ahead-Preis", unit: "€/MWh" },
  re: { label: "EE-Anteil", unit: "%" },
  residual: { label: "Residuallast", unit: "GW" },
  load: { label: "Netzlast", unit: "GW" },
  co2: { label: "CO₂-Intensität", unit: "g/kWh" },
} as const;
export type ValueCondKind = keyof typeof VALUE_CONDITIONS;

export type Condition =
  | { kind: ValueCondKind; op: CondOp; value: number }
  | { kind: "dow"; days: number[] } // ISO weekdays 1 = Mon … 7 = Sun
  | { kind: "hour"; from: number; to: number }; // local hours, inclusive

export const DOW_PRESETS: { label: string; days: number[] }[] = [
  { label: "Sa + So", days: [6, 7] },
  { label: "Mo – Fr", days: [1, 2, 3, 4, 5] },
];

export function serializeCondition(c: Condition): string {
  if (c.kind === "dow") return `dow.${c.days.join("")}`;
  if (c.kind === "hour") return `hour.${c.from}-${c.to}`;
  return `${c.kind}.${c.op}.${c.value}`;
}

export function parseCondition(raw: string): Condition | null {
  const value = /^(price|re|residual|load|co2)\.(lt|le|gt|ge)\.(-?\d+(?:\.\d+)?)$/.exec(raw);
  if (value) return { kind: value[1] as ValueCondKind, op: value[2] as CondOp, value: Number(value[3]) };
  const [kind, a] = raw.split(".");
  if (kind === "dow") {
    const days = [...new Set((a ?? "").split("").map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    return days.length ? { kind: "dow", days } : null;
  }
  if (kind === "hour") {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(a ?? "");
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2]);
    return from >= 0 && to <= 23 && from <= to ? { kind: "hour", from, to } : null;
  }
  return null;
}

export function describeCondition(c: Condition): string {
  if (c.kind === "dow") {
    const preset = DOW_PRESETS.find((p) => p.days.join() === c.days.join());
    const names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    return `Wochentag: ${preset?.label ?? c.days.map((d) => names[d - 1]).join(", ")}`;
  }
  if (c.kind === "hour") return `Uhrzeit ${c.from}–${c.to + 1} Uhr`;
  const def = VALUE_CONDITIONS[c.kind];
  return `${def.label} ${COND_OPS[c.op]} ${String(c.value).replace(".", ",")} ${def.unit}`;
}

/* ---------- Regions ---------- */

/** The four control areas. Selected zones are summed; all four together = Germany. */
export const ZONE_KEYS = ["50Hertz", "Amprion", "TenneT", "TransnetBW"] as const;
export type ZoneRegion = (typeof ZONE_KEYS)[number];

export function regionLabel(regions: readonly string[]): string {
  return regions.length === ZONE_KEYS.length ? "alle Regelzonen (Deutschland)" : regions.join(" + ");
}

/* ---------- Query state ---------- */

export type HistoryQuery = {
  from: string; // YYYY-MM-DD (Berlin calendar)
  to: string; // inclusive
  res: Resolution | "auto";
  compare: boolean;
  regions: ZoneRegion[];
  carriers: CarrierKey[];
  metrics: Metric[];
  flow: (typeof NEIGHBOURS)[number] | "sum";
  conditions: Condition[];
  chart: ChartType;
  heat: HeatMetric;
  heatYear: number | null;
};

const ALL_CARRIERS = CARRIERS.map((c) => c.key);

export function today(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export function defaultQuery(now = today()): HistoryQuery {
  return {
    from: format(addDays(parseISO(now), -29), "yyyy-MM-dd"),
    to: now,
    res: "auto",
    compare: false,
    regions: [...ZONE_KEYS],
    carriers: ALL_CARRIERS,
    metrics: ["load"],
    flow: "sum",
    conditions: [],
    chart: "stacked",
    heat: "residual",
    heatYear: null,
  };
}

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const list = (v: string | null) => (v == null ? null : v.split(",").filter(Boolean));

/** Parses URL search params; unknown or invalid values fall back to defaults. */
export function parseQuery(params: URLSearchParams, now = today()): HistoryQuery {
  const d = defaultQuery(now);
  const from = isDate(params.get("from")) ? params.get("from")! : d.from;
  const to = isDate(params.get("to")) ? params.get("to")! : d.to;
  const res = params.get("res");
  const rawRegions = list(params.get("regions"));
  // "DE" (older links / saved views) means all four control areas.
  const regions = rawRegions?.includes("DE")
    ? [...ZONE_KEYS]
    : rawRegions?.filter((r): r is ZoneRegion => (ZONE_KEYS as readonly string[]).includes(r));
  const carriers = list(params.get("carriers"))?.filter((c): c is CarrierKey => ALL_CARRIERS.includes(c as CarrierKey));
  const metrics = list(params.get("metrics"))?.filter((m): m is Metric => METRICS.includes(m as Metric));
  const flow = params.get("flow");
  const chart = params.get("chart");
  const heat = params.get("heat");
  const heatYear = Number(params.get("heatYear"));
  return {
    from: from < DATA_START ? DATA_START : from > now ? now : from,
    to: to > now ? now : to < from ? from : to,
    res: res && (RESOLUTIONS as readonly string[]).includes(res) ? (res as Resolution) : "auto",
    compare: params.get("compare") === "1",
    regions: regions?.length ? ZONE_KEYS.filter((z) => regions.includes(z)) : d.regions,
    carriers: carriers ? ALL_CARRIERS.filter((c) => carriers.includes(c)) : d.carriers,
    metrics: metrics ? METRICS.filter((m) => metrics.includes(m)) : d.metrics,
    flow: flow && (NEIGHBOURS as readonly string[]).includes(flow) ? (flow as HistoryQuery["flow"]) : "sum",
    conditions: params
      .getAll("cond")
      .map(parseCondition)
      .filter((c): c is Condition => c != null)
      .slice(0, 6),
    chart: chart && (CHART_TYPES as readonly string[]).includes(chart) ? (chart as ChartType) : "stacked",
    heat: heat && (HEAT_METRICS as readonly string[]).includes(heat) ? (heat as HeatMetric) : "residual",
    heatYear: Number.isInteger(heatYear) && heatYear >= 2015 && heatYear <= 2100 ? heatYear : null,
  };
}

/** Serialises only non-default values, so URLs stay short. */
export function serializeQuery(q: HistoryQuery, now = today()): URLSearchParams {
  const d = defaultQuery(now);
  const p = new URLSearchParams();
  p.set("from", q.from);
  p.set("to", q.to);
  if (q.res !== "auto") p.set("res", q.res);
  if (q.compare) p.set("compare", "1");
  if (q.regions.join() !== d.regions.join()) p.set("regions", q.regions.join(","));
  if (q.carriers.join() !== d.carriers.join()) p.set("carriers", q.carriers.join(","));
  if (q.metrics.join() !== d.metrics.join()) p.set("metrics", q.metrics.join(","));
  if (q.flow !== "sum") p.set("flow", q.flow);
  for (const c of q.conditions) p.append("cond", serializeCondition(c));
  if (q.chart !== "stacked") p.set("chart", q.chart);
  if (q.heat !== "residual") p.set("heat", q.heat);
  if (q.heatYear != null) p.set("heatYear", String(q.heatYear));
  return p;
}

/* ---------- Resolution ---------- */

export function rangeDays(q: Pick<HistoryQuery, "from" | "to">): number {
  return differenceInCalendarDays(parseISO(q.to), parseISO(q.from)) + 1;
}

export function estimatePoints(days: number, res: Resolution): number {
  return Math.ceil(days / RES_DAYS[res]);
}

/** Suggested resolution for a range (readable charts, never more than MAX_POINTS). */
export function suggestResolution(days: number): Resolution {
  if (days <= 3) return "15min";
  if (days <= 62) return "hour";
  if (days <= 400) return "day";
  if (days <= 3 * 366) return "week";
  if (days <= 6 * 366) return "month";
  return "year";
}

/** The resolution actually used: the chosen one, coarsened if it would exceed MAX_POINTS. */
export function effectiveResolution(q: Pick<HistoryQuery, "from" | "to" | "res">): { res: Resolution; coarsened: boolean } {
  const days = rangeDays(q);
  if (q.res === "auto") return { res: suggestResolution(days), coarsened: false };
  let i = RESOLUTIONS.indexOf(q.res);
  while (i < RESOLUTIONS.length - 1 && estimatePoints(days, RESOLUTIONS[i]!) > MAX_POINTS) i++;
  return { res: RESOLUTIONS[i]!, coarsened: RESOLUTIONS[i] !== q.res };
}

/** Clicking a bucket drills one resolution down to that bucket's period. */
export function drillDown(bucketStart: string, res: Resolution): Pick<HistoryQuery, "from" | "to" | "res"> | null {
  const d = parseISO(bucketStart);
  const iso = (x: Date) => format(x, "yyyy-MM-dd");
  switch (res) {
    case "year":
      return { from: iso(d), to: iso(addDays(addYears(d, 1), -1)), res: "month" };
    case "month":
      return { from: iso(d), to: iso(addDays(addMonths(d, 1), -1)), res: "day" };
    case "week":
      return { from: iso(d), to: iso(addDays(d, 6)), res: "day" };
    case "day":
      return { from: iso(d), to: iso(d), res: "hour" };
    case "hour":
      return { from: iso(d), to: iso(d), res: "15min" };
    default:
      return null;
  }
}

/** Same period one year earlier (for "mit Vorjahreszeitraum vergleichen"). */
export function previousYear(q: Pick<HistoryQuery, "from" | "to">): { from: string; to: string } {
  return { from: format(addYears(parseISO(q.from), -1), "yyyy-MM-dd"), to: format(addYears(parseISO(q.to), -1), "yyyy-MM-dd") };
}

/** Energy is shown for daily and coarser buckets, average power for finer ones. */
export function showsEnergy(res: Resolution) {
  return res === "day" || res === "week" || res === "month" || res === "year";
}

/** Only the parameters that change the data (not chart type or heatmap settings). */
export function dataSearch(q: HistoryQuery): string {
  return serializeQuery({ ...q, chart: "stacked", heat: "residual", heatYear: null }).toString();
}
