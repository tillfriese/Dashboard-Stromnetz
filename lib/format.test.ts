import { describe, expect, it } from "vitest";
import { formatBerlin, formatGW, formatNumber, formatSigned } from "./format";

describe("formatNumber", () => {
  it("uses German separators", () => {
    expect(formatNumber(5481.25, 1)).toBe("5.481,3");
  });
  it("renders gaps as dash, never as zero", () => {
    expect(formatNumber(null)).toBe("–");
    expect(formatNumber(Number.NaN)).toBe("–");
  });
});

describe("formatGW", () => {
  it("converts MW to GW", () => {
    expect(formatGW(54_400)).toBe("54,4");
  });
});

describe("formatSigned", () => {
  it("adds plus and real minus signs", () => {
    expect(formatSigned(3.2)).toBe("+3,2");
    expect(formatSigned(-7.2)).toBe("−7,2");
    expect(formatSigned(0)).toBe("0,0");
  });
});

describe("formatBerlin", () => {
  it("handles winter time (UTC+1)", () => {
    expect(formatBerlin(Date.UTC(2026, 10, 4, 8, 30), "HH:mm")).toBe("09:30");
  });
  it("handles summer time (UTC+2)", () => {
    expect(formatBerlin(Date.UTC(2026, 6, 1, 8, 30), "HH:mm")).toBe("10:30");
  });
  it("handles the DST switch night in March", () => {
    // 2026-03-29 01:00 UTC is 03:00 CEST (clocks jump from 02:00 to 03:00).
    expect(formatBerlin(Date.UTC(2026, 2, 29, 0, 45), "HH:mm")).toBe("01:45");
    expect(formatBerlin(Date.UTC(2026, 2, 29, 1, 0), "HH:mm")).toBe("03:00");
  });
});
