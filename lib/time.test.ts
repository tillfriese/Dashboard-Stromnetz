import { describe, expect, it } from "vitest";
import { berlinDateToMs, berlinMonths, berlinWeeks, startOfBerlinDay, startOfBerlinWeek } from "./time";

const iso = (ms: number) => new Date(ms).toISOString();

describe("Berlin calendar helpers", () => {
  it("local midnight in winter and summer", () => {
    expect(iso(berlinDateToMs("2026-01-15"))).toBe("2026-01-14T23:00:00.000Z");
    expect(iso(berlinDateToMs("2026-07-15"))).toBe("2026-07-14T22:00:00.000Z");
  });

  it("DST days are 23 h and 25 h long", () => {
    const spring = berlinDateToMs("2026-03-29");
    expect(berlinDateToMs("2026-03-30") - spring).toBe(23 * 3600_000);
    const autumn = berlinDateToMs("2025-10-26");
    expect(berlinDateToMs("2025-10-27") - autumn).toBe(25 * 3600_000);
    expect(startOfBerlinDay(Date.parse("2026-03-29T12:00:00Z"))).toBe(spring);
  });

  it("weeks start on Monday 00:00 Berlin (matches SMARD chunk timestamps)", () => {
    // SMARD's first quarter-hour chunk: 2014-12-28T23:00Z = Mon 2014-12-29 00:00 CET
    expect(startOfBerlinWeek(Date.parse("2014-12-31T12:00:00Z"))).toBe(Date.parse("2014-12-28T23:00:00Z"));
    expect(berlinWeeks(Date.parse("2026-03-28T00:00:00Z"), Date.parse("2026-03-31T00:00:00Z")).map(iso)).toEqual([
      "2026-03-22T23:00:00.000Z",
      "2026-03-29T22:00:00.000Z",
    ]);
  });

  it("splits ranges into Berlin months", () => {
    const months = berlinMonths(berlinDateToMs("2026-02-20"), berlinDateToMs("2026-04-02"));
    expect(months.map((m) => m.label)).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(iso(months[1]!.from)).toBe("2026-02-28T23:00:00.000Z");
    expect(iso(months[1]!.to)).toBe("2026-03-31T22:00:00.000Z");
  });
});
