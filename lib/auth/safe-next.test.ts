import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps local paths with query", () => {
    expect(safeNext("/historie?from=2015-01-01&res=year")).toBe("/historie?from=2015-01-01&res=year");
    expect(safeNext("/admin")).toBe("/admin");
  });
  it("rejects other origins and tricks", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\\/evil.example", "https://evil.example", "evil", "/\t/evil.example", "", null, undefined, ["/x"]]) {
      expect(safeNext(bad), String(bad)).toBe("/konto");
    }
  });
});
