import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import cbpf from "./__fixtures__/ec_cbpf.json";
import freq from "./__fixtures__/ec_frequency.json";
import price from "./__fixtures__/ec_price_dst-spring.json";
import states from "./__fixtures__/stromgedacht_states.json";
import { berlinDateToMs } from "@/lib/time";
import { NET_IMPORT_KEY, parseFlows, parseFrequency, parsePrices, PRICE_KEY, priceZones } from "./energy-charts";
import { parseEntsoeFlows } from "./entsoe";
import { parseStates, STROMGEDACHT_KEY } from "./stromgedacht";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("Energy-Charts", () => {
  it("parses day-ahead prices across the spring DST switch (96 + 92 quarter hours)", () => {
    const obs = parsePrices(price);
    expect(obs).toHaveLength(188);
    expect(obs.every((o) => o.seriesKey === PRICE_KEY)).toBe(true);
    const day = (d: string, n: string) => obs.filter((o) => o.ts >= berlinDateToMs(d) && o.ts < berlinDateToMs(n)).length;
    expect(day("2026-03-28", "2026-03-29")).toBe(96);
    expect(day("2026-03-29", "2026-03-30")).toBe(92);
    // ISO timestamps with offsets are converted to exact UTC instants
    expect(new Date(obs[0]!.ts).toISOString()).toBe("2026-03-27T23:00:00.000Z");
  });

  it("parses cross-border flows: GW -> MW, positive = import, one series per neighbour", () => {
    const obs = parseFlows(cbpf);
    const keys = new Set(obs.map((o) => o.seriesKey));
    expect(keys.size).toBe(12); // 11 neighbours + net import
    const first = (cbpf as unknown as { data: { timestamp: string; values: Record<string, number> }[] }).data[0]!;
    const fr = obs.find((o) => o.seriesKey === "energycharts:flow:FR" && o.ts === Date.parse(first.timestamp));
    expect(fr?.value).toBeCloseTo(first.values.france! * 1000, 6);
    const net = obs.find((o) => o.seriesKey === NET_IMPORT_KEY && o.ts === Date.parse(first.timestamp));
    expect(net?.value).toBeCloseTo(first.values.sum! * 1000, 6);
  });

  it("parses 1-second frequency samples", () => {
    const pts = parseFrequency(freq);
    expect(pts.length).toBeGreaterThan(100);
    expect(pts.every((p) => p.hz > 49 && p.hz < 51)).toBe(true);
    expect(pts[1]!.ts - pts[0]!.ts).toBe(1000);
  });

  it("rejects unexpected formats", () => {
    expect(() => parsePrices({ foo: "bar" })).toThrow(/unexpected format/);
  });

  it("uses bidding zone DE-AT-LU before the split on 1 Oct 2018, DE-LU afterwards", () => {
    const sep = Date.parse("2018-09-01T00:00:00Z");
    const nov = Date.parse("2018-11-01T00:00:00Z");
    expect(priceZones(sep, nov)).toEqual([
      { bzn: "DE-AT-LU", from: sep, to: Date.parse("2018-09-30T22:00:00Z") },
      { bzn: "DE-LU", from: Date.parse("2018-09-30T22:00:00Z"), to: nov },
    ]);
    expect(priceZones(Date.parse("2015-01-01T00:00:00Z"), Date.parse("2015-02-01T00:00:00Z")).map((z) => z.bzn)).toEqual(["DE-AT-LU"]);
    expect(priceZones(Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-02-01T00:00:00Z")).map((z) => z.bzn)).toEqual(["DE-LU"]);
  });
});

describe("StromGedacht", () => {
  it("expands state ranges onto the quarter-hour grid", () => {
    const obs = parseStates(states);
    expect(obs.length).toBeGreaterThan(48 * 4 - 2);
    expect(obs.every((o) => o.seriesKey === STROMGEDACHT_KEY && o.ts % (15 * 60_000) === 0)).toBe(true);
    expect(new Set(obs.map((o) => o.ts)).size).toBe(obs.length);
  });

  it("handles DST in range boundaries", () => {
    const obs = parseStates({
      states: [{ from: "2026-03-29T00:00:00+01:00", to: "2026-03-30T00:00:00+02:00", state: 1 }],
    });
    expect(obs).toHaveLength(92);
  });
});

describe("ENTSO-E (synthetic fixture)", () => {
  it("fills A03 curves forward and keeps UTC instants", () => {
    const pts = parseEntsoeFlows(fixture("entsoe_a11_synthetic.xml"));
    expect(pts).toHaveLength(8);
    expect(pts.map(([, v]) => v)).toEqual([1200, 1250, 1250, 1250, 900, 900, 900, 1000]);
    expect(new Date(pts[0]![0]).toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });

  it("treats 'No matching data' as an empty result", () => {
    expect(parseEntsoeFlows(fixture("entsoe_no_data.xml"))).toEqual([]);
  });
});
