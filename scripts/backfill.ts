// CLI backfill, same job logic and table as the admin UI.
// Usage: npm run backfill -- --from 2015-01-01 [--to 2026-11-04] [--sources smard,energycharts] [--resume <job-id>]
import { parseArgs } from "node:util";
import { cancelBackfill, createBackfill, defaultSources, resumeBackfill, runPendingJobs, type Progress } from "../lib/ingest/backfill";
import { pool } from "../lib/db";
import { STORED_SOURCES, type StoredSourceId } from "../lib/sources";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    sources: { type: "string" },
    resume: { type: "string" },
  },
});

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

async function main() {
  let jobId: string;
  if (values.resume) {
    await resumeBackfill(values.resume);
    jobId = values.resume;
  } else {
    const sources = values.sources
      ? (values.sources.split(",").map((s) => s.trim()) as StoredSourceId[])
      : await defaultSources();
    const unknown = sources.filter((s) => !STORED_SOURCES.includes(s));
    if (unknown.length) throw new Error(`Unbekannte Quelle(n): ${unknown.join(", ")} (erlaubt: ${STORED_SOURCES.join(", ")})`);
    const job = await createBackfill({ from: values.from ?? "2015-01-01", to: values.to ?? today, sources });
    jobId = job.id;
  }
  console.log(`Import ${jobId} gestartet. Abbrechen mit Strg+C (fortsetzbar mit --resume ${jobId}).`);

  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log("\nBreche ab …");
    void cancelBackfill(jobId);
  });

  let last = 0;
  await runPendingJobs((job) => {
    if (Date.now() - last < 3_000) return;
    last = Date.now();
    const parts = Object.entries(job.progress as Progress).map(([s, p]) => `${s} ${p!.done.length}/${p!.total}`);
    console.log(`[${new Date().toLocaleTimeString("de-DE")}] ${job.currentChunk ?? ""} · ${parts.join(" · ")} · ${job.rows} Zeilen`);
  });
  const { rows } = await pool().query("SELECT status, rows, error FROM backfill_jobs WHERE id = $1", [jobId]);
  const r = rows[0];
  console.log(`Status: ${r?.status} · ${r?.rows} Zeilen${r?.error ? ` · ${r.error}` : ""}`);
  if (r?.status === "pending") console.log("Hinweis: Ein anderer Prozess (z. B. die App) führt gerade einen Import aus.");
  process.exitCode = r?.status === "done" ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
