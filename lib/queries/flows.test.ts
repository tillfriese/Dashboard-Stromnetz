import { describe, expect, it } from "vitest";
import { latestCompleteFlows, newerSnapshot } from "./flows";

const Q = 15 * 60_000;
const H = 3600_000;
const T0 = Date.UTC(2026, 10, 5, 8, 0);
const key = (cc: string) => `flow:${cc}`;

function data(rows: Record<string, [number, number][]>) {
  return new Map(Object.entries(rows).map(([k, pts]) => [k, new Map(pts)]));
}

describe("latestCompleteFlows", () => {
  const base = { keyFor: key, maxAgeMs: Q, maxZeros: 1, lookbackMs: 12 * H };

  it("takes the newest quarter hour in which every border has a value", () => {
    const d = data({ "flow:AT": [[T0, 100], [T0 + Q, 200]], "flow:PL": [[T0, -50]] });
    const snap = latestCompleteFlows(d, ["AT", "PL"], T0 + Q, base);
    expect(snap).toEqual({ ts: T0, flows: [{ country: "AT", mw: 100 }, { country: "PL", mw: -50 }], netImportMW: 50 });
  });

  it("uses the net import series when given", () => {
    const d = data({ "flow:AT": [[T0, 100]], net: [[T0, 999]] });
    expect(latestCompleteFlows(d, ["AT"], T0, { ...base, netKey: "net" })?.netImportMW).toBe(999);
  });

  it("skips quarter hours with too many borders at exactly 0", () => {
    const d = data({ "flow:AT": [[T0, 1], [T0 + Q, 0]], "flow:PL": [[T0, 2], [T0 + Q, 0]] });
    expect(latestCompleteFlows(d, ["AT", "PL"], T0 + Q, base)?.ts).toBe(T0);
  });

  it("carries hourly values over to the following quarter hours", () => {
    const d = data({ "flow:AT": [[T0 + 45 * 60_000, 10]], "flow:CH": [[T0, 20]] });
    const snap = latestCompleteFlows(d, ["AT", "CH"], T0 + 45 * 60_000, { ...base, maxAgeMs: H });
    expect(snap?.ts).toBe(T0 + 45 * 60_000);
    expect(snap?.flows).toEqual([{ country: "AT", mw: 10 }, { country: "CH", mw: 20 }]);
  });

  it("returns null without a complete quarter hour", () => {
    expect(latestCompleteFlows(data({ "flow:AT": [[T0, 1]] }), ["AT", "PL"], T0, base)).toBeNull();
  });
});

describe("newerSnapshot", () => {
  it("prefers the first one on a tie and otherwise the newer one", () => {
    const a = { ts: 1, s: "a" };
    const b = { ts: 1, s: "b" };
    expect(newerSnapshot(a, b)).toBe(a);
    expect(newerSnapshot(a, { ts: 2, s: "c" })?.s).toBe("c");
    expect(newerSnapshot(null, b)).toBe(b);
  });
});
