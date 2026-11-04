import { pool } from "@/lib/db";
import { startupState } from "@/lib/server/startup";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/** Liveness/readiness probe for the Docker healthcheck. */
export async function GET() {
  const state = startupState();
  if (state.phase !== "ready") {
    return Response.json({ status: state.phase, error: state.error }, { status: 503, headers });
  }
  try {
    const started = performance.now();
    await pool().query("SELECT 1");
    return Response.json(
      { status: "ok", db: "ok", dbLatencyMs: Math.round(performance.now() - started), uptimeS: Math.round(process.uptime()) },
      { headers },
    );
  } catch (err) {
    return Response.json({ status: "error", db: (err as Error).message }, { status: 503, headers });
  }
}
