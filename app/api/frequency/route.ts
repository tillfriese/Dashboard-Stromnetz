import { frequencySnapshot } from "@/lib/frequency/poller";

export const dynamic = "force-dynamic";

/** Last 5 minutes of grid frequency from the in-memory ring buffer. */
export async function GET() {
  const snap = frequencySnapshot();
  if (!snap.source || !snap.latest) {
    // Not an error: the buffer is still empty after a restart or no source is configured.
    return Response.json({ available: false, error: snap.lastError }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    {
      available: true,
      source: snap.source,
      latest: snap.latest,
      deviationMHz: Math.round((snap.latest.hz - 50) * 1000),
      points: snap.points.map((p) => [p.ts, p.hz]),
    },
    { headers: { "Cache-Control": "public, max-age=2" } },
  );
}
