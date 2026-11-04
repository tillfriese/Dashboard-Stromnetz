import { describe, expect, it } from "vitest";
import autumn from "./__fixtures__/smard_4068_TenneT_dst-autumn.json";
import index from "./__fixtures__/smard_index_410_DE.json";
import latest from "./__fixtures__/smard_410_DE_latest.json";
import spring from "./__fixtures__/smard_410_DE_dst-spring.json";
import { berlinDateToMs } from "@/lib/time";
import { parseSmardChunk, parseSmardIndex, SMARD_FILTERS, smardAdapter } from "./smard";

const countDay = (obs: { ts: number }[], day: string, next: string) =>
  obs.filter((o) => o.ts >= berlinDateToMs(day) && o.ts < berlinDateToMs(next)).length;

describe("SMARD parser", () => {
  it("converts MWh per quarter hour to MW (x4)", () => {
    const raw = (spring as unknown as { series: [number, number | null][] }).series.find(([, v]) => v != null)!;
    const [obs] = parseSmardChunk({ series: [raw] }, "smard:load:DE");
    expect(obs).toEqual({ seriesKey: "smard:load:DE", ts: raw[0], value: raw[1]! * 4 });
  });

  it("spring DST week: 2026-03-29 has 92 quarter hours, the week 668", () => {
    const obs = parseSmardChunk(spring, "smard:load:DE");
    expect(obs).toHaveLength(668);
    expect(countDay(obs, "2026-03-29", "2026-03-30")).toBe(92);
    expect(countDay(obs, "2026-03-28", "2026-03-29")).toBe(96);
    // chunk starts Monday 00:00 CET
    expect(new Date(obs[0]!.ts).toISOString()).toBe("2026-03-22T23:00:00.000Z");
    // strictly increasing, 15-minute steps in UTC (no duplicate or missing hour)
    for (let i = 1; i < obs.length; i++) expect(obs[i]!.ts - obs[i - 1]!.ts).toBe(15 * 60_000);
  });

  it("autumn DST week: 2025-10-26 has 100 quarter hours", () => {
    const obs = parseSmardChunk(autumn, "smard:solar:TenneT");
    expect(obs).toHaveLength(676);
    expect(countDay(obs, "2025-10-26", "2025-10-27")).toBe(100);
  });

  it("drops null values instead of storing zeros", () => {
    const series = (latest as unknown as { series: [number, number | null][] }).series;
    const nulls = series.filter(([, v]) => v == null).length;
    expect(nulls).toBeGreaterThan(0);
    const obs = parseSmardChunk(latest, "smard:load:DE");
    expect(obs).toHaveLength(series.length - nulls);
    expect(obs.every((o) => Number.isFinite(o.value))).toBe(true);
  });

  it("rejects unexpected formats", () => {
    expect(() => parseSmardChunk({ foo: 1 }, "x")).toThrow(/unexpected chunk format/);
  });

  it("parses the index", () => {
    expect(parseSmardIndex(index)[0]).toBe(Date.parse("2014-12-28T23:00:00Z"));
  });

  it("defines one series per filter and published region", () => {
    const keys = smardAdapter.series().map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("smard:load:TransnetBW");
    expect(keys).not.toContain("smard:lignite:TransnetBW");
    expect(SMARD_FILTERS.find((f) => f.id === 411)?.kind).toBe("forecast");
  });
});
