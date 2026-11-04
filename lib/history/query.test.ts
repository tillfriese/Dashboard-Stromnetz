import { describe, expect, it } from "vitest";
import {
  defaultQuery,
  describeCondition,
  drillDown,
  effectiveResolution,
  parseCondition,
  parseQuery,
  previousYear,
  serializeCondition,
  serializeQuery,
  suggestResolution,
} from "./query";

const NOW = "2026-11-04";

describe("history query (URL state)", () => {
  it("round-trips through search params", () => {
    const q = {
      ...defaultQuery(NOW),
      from: "2015-01-01",
      to: "2025-12-31",
      res: "year" as const,
      compare: true,
      regions: ["Amprion", "TenneT"] as const,
      carriers: ["wind", "solar", "lignite"] as const,
      metrics: ["price", "co2"] as const,
      flow: "FR" as const,
      conditions: [
        { kind: "price" as const, op: "lt" as const, value: 0 },
        { kind: "dow" as const, days: [6, 7] },
      ],
      chart: "percent" as const,
      heat: "price" as const,
      heatYear: 2025,
    };
    const parsed = parseQuery(serializeQuery(q as never, NOW), NOW);
    expect(parsed).toEqual(q);
  });

  it("selects all four control areas by default; old 'DE' links mean all four", () => {
    expect(defaultQuery(NOW).regions).toEqual(["50Hertz", "Amprion", "TenneT", "TransnetBW"]);
    expect(parseQuery(new URLSearchParams("regions=DE"), NOW).regions).toEqual(["50Hertz", "Amprion", "TenneT", "TransnetBW"]);
    expect(parseQuery(new URLSearchParams("regions=TenneT,Amprion"), NOW).regions).toEqual(["Amprion", "TenneT"]);
    // "Keine": an explicitly empty selection survives the URL round trip
    const none = parseQuery(new URLSearchParams("regions="), NOW);
    expect(none.regions).toEqual([]);
    expect(parseQuery(serializeQuery(none, NOW), NOW).regions).toEqual([]);
  });

  it("keeps default values out of the URL", () => {
    const p = serializeQuery(defaultQuery(NOW), NOW);
    expect([...p.keys()]).toEqual(["from", "to", "metrics"]); // metrics always explicit (legacy rule)
  });

  it("falls back to defaults for invalid input and clamps the range", () => {
    const q = parseQuery(new URLSearchParams("from=1999-01-01&to=2099-01-01&res=decade&regions=Mars&carriers=&cond=price.xx.1"), NOW);
    expect(q.from).toBe("2015-01-01");
    expect(q.to).toBe(NOW);
    expect(q.res).toBe("auto");
    expect(q.regions).toEqual(["50Hertz", "Amprion", "TenneT", "TransnetBW"]);
    expect(q.carriers).toEqual([]); // explicitly empty selection is allowed
    expect(q.conditions).toEqual([]);
  });
});

describe("conditions", () => {
  it("parses and serialises all kinds", () => {
    for (const raw of ["price.lt.0", "re.gt.80", "residual.le.-2.5", "dow.67", "hour.10-15", "co2.ge.400"]) {
      expect(serializeCondition(parseCondition(raw)!)).toBe(raw);
    }
    expect(parseCondition("hour.15-10")).toBeNull();
    expect(parseCondition("dow.89")).toBeNull();
    expect(parseCondition("foo.lt.1")).toBeNull();
  });

  it("describes conditions in German", () => {
    expect(describeCondition(parseCondition("price.lt.0")!)).toBe("Day-Ahead-Preis < 0 €/MWh");
    expect(describeCondition(parseCondition("dow.67")!)).toBe("Wochentag: Sa + So");
    expect(describeCondition(parseCondition("re.gt.80")!)).toBe("EE-Anteil > 80 %");
  });
});

describe("resolution", () => {
  it("suggests readable resolutions", () => {
    expect(suggestResolution(2)).toBe("15min");
    expect(suggestResolution(30)).toBe("hour");
    expect(suggestResolution(365)).toBe("day");
    expect(suggestResolution(4000)).toBe("year");
  });

  it("never exceeds 5000 points", () => {
    expect(effectiveResolution({ from: "2015-01-01", to: "2025-12-31", res: "15min" })).toEqual({ res: "day", coarsened: true });
    expect(effectiveResolution({ from: "2025-01-01", to: "2025-12-31", res: "hour" })).toEqual({ res: "day", coarsened: true });
    expect(effectiveResolution({ from: "2025-01-01", to: "2025-01-31", res: "15min" })).toEqual({ res: "15min", coarsened: false });
  });

  it("drills down one level", () => {
    expect(drillDown("2024-01-01", "year")).toEqual({ from: "2024-01-01", to: "2024-12-31", res: "month" });
    expect(drillDown("2024-02-01", "month")).toEqual({ from: "2024-02-01", to: "2024-02-29", res: "day" });
    expect(drillDown("2026-03-29", "day")).toEqual({ from: "2026-03-29", to: "2026-03-29", res: "hour" });
    expect(drillDown("2026-03-29", "15min")).toBeNull();
  });

  it("shifts to the previous year", () => {
    expect(previousYear({ from: "2024-02-29", to: "2024-03-31" })).toEqual({ from: "2023-02-28", to: "2023-03-31" });
  });
});

import { completeRows, type Row } from "./derive";

describe("completeRows", () => {
  it("drops partial edge buckets", () => {
    const row = (quarters: number) => ({ quarters }) as Row;
    const rows = [row(384), row(672), row(672), row(668), row(676), row(96)];
    expect(completeRows(rows).map((r) => r.quarters)).toEqual([672, 672, 668, 676]);
  });
});

describe("dataRegions", () => {
  it("uses the official Germany total when all four zones are selected", async () => {
    const { dataRegions, ZONE_KEYS } = await import("./query");
    expect(dataRegions([...ZONE_KEYS])).toEqual(["DE"]);
    expect(dataRegions(["Amprion", "TenneT"])).toEqual(["Amprion", "TenneT"]);
  });
});

describe("PRESETS", () => {
  it("Standard = last 30 days without extra metric charts, Alle Daten = since 2015, monthly, all metrics", async () => {
    const { parseQuery, presetSearch } = await import("./query");
    const std = parseQuery(new URLSearchParams(presetSearch("standard", "2026-11-04")!), "2026-11-04");
    expect([std.from, std.to, std.res, std.metrics, std.heatYear]).toEqual(["2026-10-06", "2026-11-04", "auto", [], null]);
    // The default view (no URL parameters) is the "Standard" template.
    expect(presetSearch("standard", "2026-11-04")).toBe("from=2026-10-06&to=2026-11-04&metrics=");
    expect(parseQuery(new URLSearchParams(""), "2026-11-04").metrics).toEqual([]);
  });

  it("old links without metrics parameter keep showing the grid load", async () => {
    const { parseQuery, presetSearch, METRICS } = await import("./query");
    expect(parseQuery(new URLSearchParams("from=2025-01-01&to=2025-12-31"), "2026-11-04").metrics).toEqual(["load"]);
    expect(parseQuery(new URLSearchParams("from=2025-01-01&metrics="), "2026-11-04").metrics).toEqual([]);
    const all = parseQuery(new URLSearchParams(presetSearch("all", "2027-03-01")!), "2027-03-01");
    expect([all.from, all.to, all.res, all.metrics]).toEqual(["2015-01-01", "2027-03-01", "month", [...METRICS]]);
  });
});
