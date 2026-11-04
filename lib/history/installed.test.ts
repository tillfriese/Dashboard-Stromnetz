import { describe, expect, it } from "vitest";
import { combineInstalled } from "./installed";

const monthly = {
  data: [
    { timestamp: "2023-03-01T00:00:00+01:00", values: { wind_onshore: 58, wind_offshore: 8, solar_dc: 70, biomass: 8.8 } },
    { timestamp: "2023-12-01T00:00:00+01:00", values: { wind_onshore: 61, wind_offshore: 8.5, solar_dc: 83, biomass: 8.8 } },
    { timestamp: "2024-05-01T00:00:00+02:00", values: { wind_onshore: 62, wind_offshore: 8.6, solar_dc: 90, biomass: 8.9 } },
  ],
};
const yearly = {
  data: [
    { timestamp: "2022-01-01T00:00:00+01:00", values: { nuclear: 4.056, fossil_gas: 34, fossil_oil: 4, other_non_renewable: 2, hydro_pumped_storage: 10, hydro: 5.4 } },
    { timestamp: "2023-01-01T00:00:00+01:00", values: { nuclear: 0, fossil_gas: 35.7, fossil_oil: 4, other_non_renewable: 2, hydro_pumped_storage: 10, hydro: 5.4 } },
    { timestamp: "2024-01-01T00:00:00+01:00", values: { nuclear: 0, fossil_gas: 35.6, fossil_oil: 3.7, other_non_renewable: 2.4, hydro_pumped_storage: 9.9, hydro: 5.4 } },
  ],
};

describe("combineInstalled", () => {
  const pts = combineInstalled(monthly, yearly);

  it("takes wind, solar and biomass from the monthly series", () => {
    expect(pts[0]!.values.wind).toBe(66);
    expect(pts[0]!.values.solar).toBe(70);
  });

  it("fills conventional carriers with the last known year-end value", () => {
    // March 2023: end of 2022 (nuclear still running)
    expect(pts[0]!.values.nuclear).toBe(4.056);
    expect(pts[0]!.values.gas).toBe(34);
    // December 2023: end of 2023
    expect(pts[1]!.values.nuclear).toBe(0);
    expect(pts[1]!.values.gas).toBe(35.7);
    // Latest month (May 2024): latest state of the current year
    expect(pts[2]!.values.gas).toBe(35.6);
    expect(pts[2]!.values.other).toBeCloseTo(3.7 + 2.4 + 9.9);
    expect(pts[2]!.values.hydro).toBe(5.4);
  });

  it("without yearly data only the monthly carriers have values", () => {
    const only = combineInstalled(monthly, null);
    expect(only[0]!.values.wind).toBe(66);
    expect(only[0]!.values.gas).toBeNull();
  });
});
