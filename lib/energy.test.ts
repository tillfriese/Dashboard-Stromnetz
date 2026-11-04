import { describe, expect, it } from "vitest";
import { byCarrier, co2Intensity, renewableShare, totalGeneration } from "./energy";

const snap = { lignite: 10_000, hardcoal: 5_000, gas: 10_000, wind_onshore: 20_000, wind_offshore: 2_000, solar: 3_000, biomass: 4_000, hydro: 1_000, pumped_storage: 500, other_conventional: 1_000, other_renewable: 500, nuclear: 0 };

describe("energy calculations", () => {
  it("sums generation over all carriers", () => {
    expect(totalGeneration(snap)).toBe(57_000);
  });
  it("computes the renewable share of generation", () => {
    expect(renewableShare(snap)).toBeCloseTo((30_500 / 57_000) * 100, 6);
  });
  it("computes CO2 intensity from UBA factors", () => {
    const expected = (10_000 * 1119 + 5_000 * 860 + 10_000 * 392 + 1_000 * 800) / 57_000;
    expect(co2Intensity(snap)).toBeCloseTo(expected, 6);
  });
  it("groups metrics into the nine display carriers", () => {
    const c = byCarrier(snap);
    expect(c.wind).toBe(22_000);
    expect(c.other).toBe(2_000);
    expect(Object.keys(c)).toEqual(["hydro", "biomass", "wind", "solar", "lignite", "hardcoal", "gas", "nuclear", "other"]);
  });
  it("returns null instead of dividing by zero", () => {
    expect(renewableShare({})).toBeNull();
    expect(co2Intensity({})).toBeNull();
  });
});
