import { describe, expect, it } from "vitest";
import { parseUserDate } from "./dates";

describe("parseUserDate", () => {
  it("accepts German and ISO formats", () => {
    expect(parseUserDate("04.11.2026")).toBe("2026-11-04");
    expect(parseUserDate("4.11.2026")).toBe("2026-11-04");
    expect(parseUserDate(" 1.1.15 ")).toBe("2015-01-01");
    expect(parseUserDate("2026-11-04")).toBe("2026-11-04");
    expect(parseUserDate("4/11/2026")).toBe("2026-11-04");
  });
  it("rejects impossible or incomplete dates", () => {
    expect(parseUserDate("31.02.2026")).toBeNull();
    expect(parseUserDate("2026-13-01")).toBeNull();
    expect(parseUserDate("04.11.")).toBeNull();
    expect(parseUserDate("morgen")).toBeNull();
    expect(parseUserDate("")).toBeNull();
  });
});
