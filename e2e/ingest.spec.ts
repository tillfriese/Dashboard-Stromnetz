import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { newPageWithAuthenticator, psql, setupAdmin } from "./helpers";

/*
 * Phase 3 acceptance: real imports from SMARD / Energy-Charts into the compose database.
 * Needs internet access. The imported periods are real data and stay in the database.
 */

function backfillCli(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync("docker", ["compose", "exec", "-T", "app", "npm", "run", "--silent", "backfill", "--", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

const countPerBerlinDay = (key: string, day: string) =>
  Number(
    psql(`SELECT count(*) FROM observations o JOIN series s ON s.id = o.series_id
          WHERE s.key = '${key}' AND (o.ts AT TIME ZONE 'Europe/Berlin')::date = '${day}'`),
  );

test.describe.serial("Datenabruf (Phase 3)", () => {
  test.setTimeout(6 * 60_000);

  test("Testimport über 7 Tage inkl. Zeitumstellung (Herbst) per CLI", async () => {
    const { out, code } = backfillCli(["--from", "2025-10-23", "--to", "2025-10-29", "--sources", "smard,energycharts"]);
    expect(out).toContain("Status: done");
    expect(code).toBe(0);

    // Raw quarter hours per Berlin calendar day: 25-hour day on 2025-10-26.
    for (const key of ["smard:load:DE", "smard:wind_onshore:TenneT", "energycharts:price:DE-LU", "energycharts:flow:FR"]) {
      expect(countPerBerlinDay(key, "2025-10-25"), key).toBe(96);
      expect(countPerBerlinDay(key, "2025-10-26"), key).toBe(100);
      expect(countPerBerlinDay(key, "2025-10-27"), key).toBe(96);
    }
    // Full range: 7 days + 1 hour, no zero-filled gaps for the grid load.
    const total = psql(`SELECT count(*), count(*) FILTER (WHERE value = 0) FROM observations o JOIN series s ON s.id = o.series_id
      WHERE s.key = 'smard:load:DE' AND o.ts >= '2025-10-23 00:00 Europe/Berlin' AND o.ts < '2025-10-30 00:00 Europe/Berlin'`);
    expect(total).toBe("676|0");
    // MWh per quarter hour were converted to MW: German grid load is between 30 and 90 GW.
    const [min, max] = psql(`SELECT min(value)::int, max(value)::int FROM observations o JOIN series s ON s.id = o.series_id
      WHERE s.key = 'smard:load:DE' AND o.ts >= '2025-10-23' AND o.ts < '2025-10-30'`).split("|").map(Number);
    expect(min).toBeGreaterThan(30_000);
    expect(max).toBeLessThan(90_000);

    // Aggregates use Berlin days: the DST day has 100 values and 25 hourly buckets.
    psql(`CALL refresh_continuous_aggregate('obs_daily', '2025-10-20', '2025-11-01')`);
    psql(`CALL refresh_continuous_aggregate('obs_hourly', '2025-10-20', '2025-11-01')`);
    expect(
      psql(`SELECT d.count FROM obs_daily d JOIN series s ON s.id = d.series_id
            WHERE s.key = 'smard:load:DE' AND d.bucket = '2025-10-26 00:00 Europe/Berlin'`),
    ).toBe("100");
    expect(
      psql(`SELECT count(*) FROM obs_hourly h JOIN series s ON s.id = h.series_id WHERE s.key = 'smard:load:DE'
            AND h.bucket >= '2025-10-26 00:00 Europe/Berlin' AND h.bucket < '2025-10-27 00:00 Europe/Berlin'`),
    ).toBe("25");
  });

  test("erneuter Import ist idempotent (Upsert, keine Duplikate)", async () => {
    const before = psql(`SELECT count(*) FROM observations WHERE ts >= '2025-10-23' AND ts < '2025-10-30'`);
    const { out } = backfillCli(["--from", "2025-10-23", "--to", "2025-10-29", "--sources", "smard"]);
    expect(out).toContain("Status: done");
    expect(psql(`SELECT count(*) FROM observations WHERE ts >= '2025-10-23' AND ts < '2025-10-30'`)).toBe(before);
  });

  test("Import im Admin-Bereich abbrechen und fortsetzen", async ({ browser }) => {
    // Fresh admin account via the first-run setup.
    const context = await browser.newContext();
    const { page } = await newPageWithAuthenticator(context);
    await setupAdmin(page, "Import Test", "import@example.test");

    await page.goto("/admin/datenimport");
    const form = page.locator("section", { has: page.getByRole("heading", { name: "Zeitraum neu laden" }) });
    await form.getByLabel("Von").fill("2026-01-01");
    await form.getByLabel("Bis").fill("2026-03-31");
    for (const s of ["SMARD", "Energy-Charts", "ENTSO-E", "StromGedacht"]) {
      const box = form.getByRole("checkbox", { name: new RegExp(s) });
      if (s === "SMARD") await box.check();
      else await box.uncheck();
    }
    await form.getByRole("button", { name: "Zeitraum neu laden" }).click();

    const job = page.locator("section", { has: page.getByRole("heading", { name: /Aktueller Import/ }) });
    await expect(job.getByRole("progressbar", { name: "Fortschritt SMARD" })).toBeVisible();

    // Only one import at a time – also across processes (CLI).
    const parallel = backfillCli(["--from", "2026-01-01", "--to", "2026-01-07", "--sources", "smard"]);
    expect(parallel.out).toContain("Es läuft bereits ein Import");

    // Cancel after the first month.
    await expect(job).toContainText("1/3 Monate", { timeout: 120_000 });
    await job.getByRole("button", { name: "Abbrechen" }).click();
    const last = page.locator("section", { has: page.getByRole("heading", { name: /Letzter Import/ }) });
    await expect(last).toContainText("Abgebrochen", { timeout: 30_000 });

    const progress = () =>
      JSON.parse(psql(`SELECT progress->'smard' FROM backfill_jobs ORDER BY created_at DESC LIMIT 1`)) as {
        done: string[];
        total: number;
        chunks: number;
      };
    const afterCancel = progress();
    expect(psql(`SELECT status FROM backfill_jobs ORDER BY created_at DESC LIMIT 1`)).toBe("cancelled");
    expect(afterCancel.done).toContain("2026-01");
    expect(afterCancel.done.length).toBeLessThan(3);

    // Resume: finished months are skipped, the rest is imported.
    await last.getByRole("button", { name: "Fortsetzen" }).click();
    await expect(page.locator("section", { has: page.getByRole("heading", { name: /Letzter Import/ }) })).toContainText("Fertig", {
      timeout: 4 * 60_000,
    });
    const final = progress();
    expect(final.done.sort()).toEqual(["2026-01", "2026-02", "2026-03"]);
    // Each month was processed at most once more than needed (the one interrupted by the cancel).
    expect(final.chunks).toBeLessThanOrEqual(4);
    expect(psql(`SELECT status FROM backfill_jobs ORDER BY created_at DESC LIMIT 1`)).toBe("done");

    // The run shows up in the ingest log.
    await page.reload();
    await expect(page.locator("section", { has: page.getByRole("heading", { name: "Protokoll" }) })).toContainText("backfill");
    await context.close();
  });
});
