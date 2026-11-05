import cron, { type ScheduledTask } from "node-cron";
import { startFrequencyPoller } from "@/lib/frequency/poller";
import { rotateSalt } from "@/lib/stats/salt";
import { getSetting, isSourceEnabled } from "@/lib/settings";
import { fetchPrices } from "@/lib/sources/energy-charts";
import { fetchStromGedachtOutlook } from "@/lib/sources/stromgedacht";
import { addBerlinDays, startOfBerlinDay } from "@/lib/time";
import { kickRunner } from "./backfill";
import { ingestRange } from "./ingest";
import { recordRun } from "./runs";
import { writeObservations } from "./store";

const DAY = 24 * 3600_000;

type JobDef = { name: string; label: string; cron: string; run: () => Promise<unknown> };

/** Scheduled jobs (times in Europe/Berlin). */
const JOBS: JobDef[] = [
  {
    name: "recent",
    label: "SMARD, Grenzflüsse, Netzampel (letzte 2 Tage)",
    cron: "*/15 * * * *",
    run: async () => {
      const now = Date.now();
      // SMARD: last 2 days plus day-ahead forecasts up to the end of tomorrow.
      await settle([
        ingestRange("smard", now - 2 * DAY, addBerlinDays(startOfBerlinDay(now), 2), "recent"),
        ingestRange("energycharts", now - 2 * DAY, now + 3600_000, "recent"),
        stromGedachtOutlook(),
      ]);
    },
  },
  {
    name: "prices",
    label: "Day-Ahead-Preise heute und morgen",
    cron: "7 * * * *",
    run: async () => {
      if (!(await isSourceEnabled("energycharts"))) return;
      const today = startOfBerlinDay(Date.now());
      await recordRun("energycharts", "prices", async () => ({
        rows: await writeObservations(await fetchPrices(addBerlinDays(today, -1), addBerlinDays(today, 2))),
      }));
    },
  },
  {
    name: "entsoe",
    label: "ENTSO-E Grenzflüsse, letzter Tag (nur mit Token)",
    // Every 15 min (offset to the SMARD job): ENTSO-E is the fresher source for the map on "Aktuell".
    cron: "5,20,35,50 * * * *",
    run: async () => {
      if (!(await getSetting("entsoe.token"))) return;
      await ingestRange("entsoe", Date.now() - DAY, Date.now(), "recent");
    },
  },
  {
    name: "salt",
    label: "Neuer Salt für die Besucherstatistik",
    cron: "0 0 * * *",
    // The previous salt is overwritten, so visitors cannot be linked across days.
    run: () => rotateSalt(),
  },
  {
    name: "revision",
    label: "Revision der letzten 60 Tage",
    cron: "30 3 * * *",
    run: async () => {
      // Values are corrected long after the fact (grid load > 40 working days), so the
      // last 60 days are reloaded and upserted, in weekly windows to bound memory.
      const end = Date.now();
      const sources = ["smard", "energycharts", ...((await getSetting("entsoe.token")) ? ["entsoe" as const] : [])] as const;
      for (const source of sources) {
        for (let from = end - 60 * DAY; from < end; from += 7 * DAY) {
          await ingestRange(source, from, Math.min(from + 7 * DAY, end), "revision").catch((err) =>
            console.error(`[revision] ${source}:`, (err as Error).message),
          );
        }
      }
    },
  },
];

async function stromGedachtOutlook() {
  if (!(await isSourceEnabled("stromgedacht"))) return;
  await recordRun("stromgedacht", "recent", async () => ({ rows: await writeObservations(await fetchStromGedachtOutlook()) }));
}

async function settle(promises: Promise<unknown>[]) {
  for (const r of await Promise.allSettled(promises)) {
    if (r.status === "rejected") console.error("[scheduler]", (r.reason as Error)?.message ?? r.reason);
  }
}

const g = globalThis as unknown as { netzlageTasks?: Map<string, { def: JobDef; task: ScheduledTask; lastRun?: Date }> };

export function startScheduler() {
  if (g.netzlageTasks || process.env.DISABLE_SCHEDULER === "true") return;
  const tasks = new Map<string, { def: JobDef; task: ScheduledTask; lastRun?: Date }>();
  for (const def of JOBS) {
    const entry: { def: JobDef; task: ScheduledTask; lastRun?: Date } = {
      def,
      task: cron.schedule(
        def.cron,
        async () => {
          entry.lastRun = new Date();
          await def.run().catch((err) => console.error(`[scheduler] ${def.name}:`, err));
        },
        { timezone: "Europe/Berlin", name: def.name, noOverlap: true },
      ),
    };
    tasks.set(def.name, entry);
  }
  g.netzlageTasks = tasks;

  startFrequencyPoller();
  kickRunner(); // resume an import that was interrupted by a restart
  // Fill the "now" view right after start instead of waiting up to 15 minutes.
  void tasks.get("recent")!.task.execute();
  void tasks.get("prices")!.task.execute();
  void tasks.get("entsoe")!.task.execute(); // returns at once without a token
  console.info(`[scheduler] started ${tasks.size} jobs`);
}

/** For the admin "System" tab. */
export function scheduledJobs() {
  return [...(g.netzlageTasks?.values() ?? [])].map(({ def, task, lastRun }) => ({
    name: def.name,
    label: def.label,
    cron: def.cron,
    nextRun: task.getNextRun()?.toISOString() ?? null,
    lastRun: lastRun?.toISOString() ?? null,
  }));
}
