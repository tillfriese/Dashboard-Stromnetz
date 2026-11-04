/** In-memory ring buffer of 1-second frequency samples (never persisted). */
export class FrequencyBuffer {
  private samples: { ts: number; hz: number }[] = [];

  constructor(private readonly maxAgeMs = 10 * 60_000) {}

  /** Adds samples, de-duplicated by timestamp, kept sorted; drops samples older than maxAge. */
  add(points: { ts: number; hz: number }[]) {
    if (points.length === 0) return;
    const byTs = new Map(this.samples.map((p) => [p.ts, p]));
    for (const p of points) byTs.set(p.ts, p);
    const newest = Math.max(...byTs.keys());
    this.samples = [...byTs.values()].filter((p) => p.ts > newest - this.maxAgeMs).sort((a, b) => a.ts - b.ts);
  }

  latest() {
    return this.samples.at(-1) ?? null;
  }

  /** Samples within the last `ms` relative to the newest sample. */
  window(ms: number) {
    const newest = this.latest()?.ts;
    return newest == null ? [] : this.samples.filter((p) => p.ts > newest - ms);
  }

  get size() {
    return this.samples.length;
  }
}
