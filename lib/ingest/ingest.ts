import { isSourceEnabled } from "@/lib/settings";
import { ADAPTERS, type StoredSourceId } from "@/lib/sources";
import type { FetchContext } from "@/lib/sources/types";
import { recordRun } from "./runs";
import { writeObservations } from "./store";

/** Fetches [from, to) from one source and upserts it. Used by the scheduler. */
export async function ingestRange(source: StoredSourceId, from: number, to: number, job: string, ctx?: FetchContext) {
  if (!(await isSourceEnabled(source))) return { rows: 0, skipped: true };
  return recordRun(source, job, async () => {
    const obs = await ADAPTERS[source].fetchRange(from, to, ctx);
    return { rows: await writeObservations(obs), fetched: obs.length };
  });
}
