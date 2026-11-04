import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry } from "@/lib/http";
import { getSetting } from "@/lib/settings";
import { type FetchContext, type Observation, type SourceAdapter, SourceError } from "./types";

/*
 * ENTSO-E Transparency Platform RESTful API (optional, needs a token).
 *   https://web-api.tp.entsoe.eu/api?securityToken&documentType=A11&in_Domain&out_Domain&periodStart&periodEnd
 * documentType A11 = cross-border physical flows (MW). Each border is queried in both
 * directions; net import = flow(neighbour -> DE) - flow(DE -> neighbour).
 * Curve type A03 omits repeated values, so points are filled forward.
 */

const BASE = "https://web-api.tp.entsoe.eu/api";
const DE = "10Y1001A1001A83F"; // Germany (country/control area)

export const ENTSOE_NEIGHBOURS: Record<string, string> = {
  AT: "10YAT-APG------L",
  BE: "10YBE----------2",
  CH: "10YCH-SWISSGRIDZ",
  CZ: "10YCZ-CEPS-----N",
  DK: "10Y1001A1001A65H",
  FR: "10YFR-RTE------C",
  LU: "10YLU-CEGEDEL-NQ",
  NL: "10YNL----------L",
  NO: "10YNO-0--------C",
  PL: "10YPL-AREA-----S",
  SE: "10YSE-1--------K",
};

export const entsoeFlowKey = (cc: string) => `entsoe:flow:${cc}`;

const parser = new XMLParser({ ignoreAttributes: true, isArray: (name) => ["TimeSeries", "Period", "Point"].includes(name) });

const RESOLUTION_MS: Record<string, number> = { PT15M: 15 * 60_000, PT30M: 30 * 60_000, PT60M: 60 * 60_000 };

/** Parses a Publication_MarketDocument into [ts, MW] points (filled forward for A03 curves). */
export function parseEntsoeFlows(xml: string): [number, number][] {
  const doc = parser.parse(xml);
  if (doc.Acknowledgement_MarketDocument) {
    const text = String(doc.Acknowledgement_MarketDocument.Reason?.text ?? "");
    if (/No matching data/i.test(text)) return [];
    throw new SourceError("entsoe", text || "acknowledgement without data");
  }
  const ts = doc.Publication_MarketDocument?.TimeSeries;
  if (!ts) throw new SourceError("entsoe", "unexpected document");
  const out = new Map<number, number>();
  for (const series of ts) {
    for (const period of series.Period ?? []) {
      const start = Date.parse(period.timeInterval.start);
      const end = Date.parse(period.timeInterval.end);
      const step = RESOLUTION_MS[period.resolution];
      if (!step) throw new SourceError("entsoe", `unsupported resolution ${period.resolution}`);
      const points = (period.Point as { position: number; quantity: number }[]).sort((a, b) => a.position - b.position);
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const nextPos = points[i + 1]?.position ?? (end - start) / step + 1;
        for (let pos = p.position; pos < nextPos; pos++) out.set(start + (pos - 1) * step, Number(p.quantity));
      }
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

const period = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace(/[-T:]/g, "");

async function fetchDirection(token: string, inDomain: string, outDomain: string, from: number, to: number, ctx?: FetchContext) {
  const url =
    `${BASE}?securityToken=${encodeURIComponent(token)}&documentType=A11` +
    `&in_Domain=${inDomain}&out_Domain=${outDomain}&periodStart=${period(from)}&periodEnd=${period(to)}`;
  const res = await fetchWithRetry(url, { timeoutMs: 60_000, minIntervalMs: 300, signal: ctx?.signal });
  if (res.status === 401) throw new SourceError("entsoe", "Token ungültig (HTTP 401)");
  const text = await res.text();
  if (!res.ok && !text.includes("Acknowledgement_MarketDocument")) throw new SourceError("entsoe", `HTTP ${res.status}`);
  return parseEntsoeFlows(text);
}

export const entsoeAdapter: SourceAdapter = {
  id: "entsoe",
  earliest: "2015-01-01",
  series() {
    return Object.keys(ENTSOE_NEIGHBOURS).map((cc) => ({
      key: entsoeFlowKey(cc),
      source: "entsoe" as const,
      region: cc,
      unit: "MW",
      label: `Grenzfluss ${cc} (ENTSO-E)`,
      kind: "actual" as const,
    }));
  },
  async fetchRange(from, to, ctx) {
    const token = await getSetting("entsoe.token");
    if (!token) throw new SourceError("entsoe", "kein Token konfiguriert");
    const out: Observation[] = [];
    for (const [cc, eic] of Object.entries(ENTSOE_NEIGHBOURS)) {
      const imports = new Map(await fetchDirection(token, DE, eic, from, to, ctx)); // neighbour -> DE
      const exports = new Map(await fetchDirection(token, eic, DE, from, to, ctx)); // DE -> neighbour
      for (const ts of new Set([...imports.keys(), ...exports.keys()])) {
        if (ts < from || ts >= to) continue;
        if (!imports.has(ts) || !exports.has(ts)) continue; // incomplete pair = gap
        out.push({ seriesKey: entsoeFlowKey(cc), ts, value: imports.get(ts)! - exports.get(ts)! });
      }
    }
    return out;
  },
};
