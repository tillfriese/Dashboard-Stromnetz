import { describe, expect, it } from "vitest";
import { parseGridradar } from "@/lib/sources/gridradar";
import { FrequencyBuffer } from "./buffer";

describe("FrequencyBuffer", () => {
  it("dedupes, sorts and evicts old samples", () => {
    const b = new FrequencyBuffer(10_000);
    b.add([{ ts: 3000, hz: 50 }, { ts: 1000, hz: 49.99 }]);
    b.add([{ ts: 3000, hz: 50.01 }, { ts: 12_500, hz: 50.02 }]);
    expect(b.size).toBe(2); // 1000 evicted (older than 10 s before 12.5 s)
    expect(b.latest()).toEqual({ ts: 12_500, hz: 50.02 });
    expect(b.window(10_000).map((p) => p.ts)).toEqual([3000, 12_500]);
  });
});

describe("Gridradar parser (Grafana JSON)", () => {
  it("accepts rfc3339 and epoch timestamps", () => {
    const pts = parseGridradar([
      { target: "frequency-ucte-median-1s", datapoints: [[50.001, "2026-11-04T11:00:01Z"], [49.998, 1793790000]] },
    ]);
    expect(pts).toEqual([
      { ts: Date.parse("2026-11-04T11:00:01Z"), hz: 50.001 },
      { ts: 1793790000 * 1000, hz: 49.998 },
    ].sort((a, b) => a.ts - b.ts));
  });
});
