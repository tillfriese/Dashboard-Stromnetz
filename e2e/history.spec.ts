import { expect, test } from "@playwright/test";
import { psql } from "./helpers";

/*
 * Phase 5: "Historie". Uses periods that the earlier specs / backfill imported:
 * 2015 (full backfill) and the week 2025-10-23 … 2025-10-29 (incl. DST end on 2025-10-26).
 */

const WEEK = "from=2025-10-23&to=2025-10-29";

test.describe("Seite „Historie“", () => {
  test("Filterzustand steht komplett in der URL und übersteht ein Neuladen", async ({ page }) => {
    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=month&carriers=wind,solar&metrics=co2&chart=percent");
    const filters = page.getByRole("complementary", { name: "Filter" });
    await expect(filters.getByRole("radio", { name: "Monat" })).toHaveAttribute("aria-checked", "true");
    await expect(filters.getByRole("checkbox", { name: /Wind/ })).toBeChecked();
    await expect(filters.getByRole("checkbox", { name: /Braunkohle/ })).not.toBeChecked();
    await expect(filters.getByRole("checkbox", { name: "CO₂-Intensität" })).toBeChecked();
    // Regions: only the four control areas, all selected by default.
    await expect(filters.getByRole("checkbox", { name: /Deutschland gesamt/ })).toHaveCount(0);
    for (const z of ["50Hertz", "Amprion", "TenneT", "TransnetBW"]) await expect(filters.getByRole("checkbox", { name: `Regelzone ${z}` })).toBeChecked();
    await filters.getByRole("checkbox", { name: "Regelzone TransnetBW" }).click();
    await expect(page).toHaveURL(/regions=50Hertz%2CAmprion%2CTenneT|regions=50Hertz,Amprion,TenneT/);
    await expect(page.getByRole("list", { name: "Aktive Filter" })).toContainText("50Hertz + Amprion + TenneT");
    await filters.getByRole("checkbox", { name: "Regelzone TransnetBW" }).click();
    await expect(page).not.toHaveURL(/regions=/);
    await expect(page.getByRole("radiogroup", { name: "Diagrammtyp" }).getByRole("radio", { name: "100 %" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("list", { name: "Aktive Filter" })).toContainText("2 von 9 Energieträgern");
    await expect(page.getByRole("heading", { name: "CO₂-Intensität der Erzeugung" })).toBeVisible();
    await expect(page.getByText(/Lokaler Bestand 01\.01\.2015 – \d{2}\.\d{2}\.\d{4} · täglich revidiert/)).toBeVisible();

    // Changing filters writes the URL ...
    await page.getByRole("radiogroup", { name: "Diagrammtyp" }).getByRole("radio", { name: "Linien" }).click();
    await expect(page).toHaveURL(/chart=lines/);
    await filters.getByRole("checkbox", { name: /Biomasse/ }).check();
    await expect(page).toHaveURL(/carriers=biomass%2Cwind%2Csolar|carriers=biomass,wind,solar/);
    // ... and the state survives a reload.
    await page.reload();
    await expect(filters.getByRole("checkbox", { name: /Biomasse/ })).toBeChecked();
    await expect(page.getByRole("radiogroup", { name: "Diagrammtyp" }).getByRole("radio", { name: "Linien" })).toHaveAttribute("aria-checked", "true");
  });

  test("Zurücksetzen und Schnellwahl", async ({ page }) => {
    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=month");
    await page.getByRole("button", { name: "Zurücksetzen" }).click();
    await expect(page).not.toHaveURL(/res=month/);
    await page.getByRole("group", { name: "Schnellwahl Zeitraum" }).getByRole("button", { name: "Alles" }).click();
    await expect(page).toHaveURL(/from=2015-01-01/);
  });

  test("nie mehr als ca. 5.000 Punkte: zu feine Auflösung wird vergröbert", async ({ request }) => {
    const d = await (await request.get("/api/timeseries?from=2015-01-01&to=2016-04-30&res=15min")).json();
    expect(d.res).toBe("day");
    expect(d.coarsened).toBe(true);
    expect(d.main.buckets.length).toBeLessThanOrEqual(5000);
    const y = await (await request.get("/api/timeseries?from=2015-01-01&to=2015-12-31&res=year")).json();
    expect(y.main.labels).toEqual(["2015-01-01"]);
  });

  test("Aggregate stimmen mit den Rohdaten überein (Tage in Berliner Zeit)", async ({ request }) => {
    const d = await (await request.get(`/api/timeseries?${WEEK}&res=day`)).json();
    const i = d.main.labels.indexOf("2025-10-26");
    const [sum, count] = d.main.series["smard:load:Amprion"][i];
    expect(count).toBe(100); // 25-hour day
    const raw = psql(`SELECT round(sum(o.value)::numeric, 2), count(*) FROM observations o JOIN series s ON s.id = o.series_id
      WHERE s.key = 'smard:load:Amprion' AND (o.ts AT TIME ZONE 'Europe/Berlin')::date = '2025-10-26'`);
    expect(raw).toBe(`${(Math.round(sum * 100) / 100).toFixed(2)}|100`);
    // Default selection = all four control areas; their sum matches Germany's grid load.
    expect(Object.keys(d.main.series).some((k) => k.endsWith(":DE") && k.startsWith("smard:"))).toBe(false);
    const zones = ["50Hertz", "Amprion", "TenneT", "TransnetBW"].reduce((a, z) => a + d.main.series[`smard:load:${z}`][i][0], 0);
    const de = Number(psql(`SELECT sum(o.value) FROM observations o JOIN series s ON s.id = o.series_id
      WHERE s.key = 'smard:load:DE' AND (o.ts AT TIME ZONE 'Europe/Berlin')::date = '2025-10-26'`));
    expect(Math.abs(zones - de) / de).toBeLessThan(0.02);
  });

  test("Bedingungen werden je Viertelstunde (UND) ausgewertet und erst danach aggregiert", async ({ request }) => {
    // Weekend only: Sat 25.10. (96 quarter hours) + Sun 26.10. (100, DST end) = 49 h
    const we = await (await request.get(`/api/timeseries?${WEEK}&res=day&cond=dow.67`)).json();
    expect(we.kpi.matchedHours).toBe(49);
    expect(we.main.labels).toEqual(["2025-10-25", "2025-10-26"]);

    // Negative prices (hourly prices before Oct 2025 apply to all four quarter hours)
    const sqlNeg = (extra = "") =>
      Number(
        psql(`SELECT count(*) FROM observations l JOIN series sl ON sl.id = l.series_id AND sl.key = 'smard:load:DE'
          LEFT JOIN observations pq ON pq.series_id = (SELECT id FROM series WHERE key = 'energycharts:price:DE-LU') AND pq.ts = l.ts
          LEFT JOIN observations ph ON ph.series_id = (SELECT id FROM series WHERE key = 'energycharts:price:DE-LU') AND ph.ts = date_trunc('hour', l.ts)
          WHERE l.ts >= '2025-10-23 00:00 Europe/Berlin' AND l.ts < '2025-10-30 00:00 Europe/Berlin'
            AND coalesce(pq.value, ph.value) < 0 ${extra}`),
      ) / 4;
    const neg = await (await request.get(`/api/timeseries?${WEEK}&res=day&cond=price.lt.0`)).json();
    expect(neg.kpi.matchedHours).toBe(sqlNeg());
    expect(neg.kpi.matchedHours).toBeGreaterThan(0);

    // AND combination
    const both = await (await request.get(`/api/timeseries?${WEEK}&res=day&cond=price.lt.0&cond=dow.67`)).json();
    expect(both.kpi.matchedHours).toBe(sqlNeg("AND extract(isodow FROM l.ts AT TIME ZONE 'Europe/Berlin') IN (6, 7)"));
    expect(both.kpi.matchedHours).toBeLessThanOrEqual(neg.kpi.matchedHours);

    // Aggregation over the matching quarter hours only: wind energy on the weekend
    const windSum = we.main.series["smard:wind_onshore:Amprion"].reduce((a: number, s: [number, number] | null) => a + (s?.[0] ?? 0), 0);
    const rawWind = Number(
      psql(`SELECT sum(o.value) FROM observations o JOIN series s ON s.id = o.series_id WHERE s.key = 'smard:wind_onshore:Amprion'
        AND (o.ts AT TIME ZONE 'Europe/Berlin')::date IN ('2025-10-25', '2025-10-26')`),
    );
    expect(windSum).toBeCloseTo(rawWind, 3);
  });

  test("Bedingung in der Oberfläche hinzufügen und als Chip entfernen", async ({ page }) => {
    await page.goto(`/historie?${WEEK}`);
    await page.getByRole("button", { name: "+ Bedingung hinzufügen" }).click();
    await expect(page).toHaveURL(/cond=price\.lt\.0/);
    await expect(page.getByText("Stunden mit allen Bedingungen")).toBeVisible();
    await page.getByRole("button", { name: /Bedingung entfernen: Day-Ahead-Preis < 0/ }).click();
    await expect(page).not.toHaveURL(/cond=/);
  });

  test("Klick auf einen Balken springt eine Auflösung tiefer, Ziehen zoomt", async ({ page }) => {
    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=month");
    const chart = page.getByRole("img", { name: /Diagramm: Nettoerzeugung alle Regelzonen/ });
    await expect(chart.locator(".recharts-bar-rectangle").first()).toBeVisible();
    await chart.locator(".recharts-bar-rectangle").first().click();
    await expect(page).toHaveURL(/from=2015-01-01&to=2015-01-31&res=day/);

    // Drag across the daily chart -> zoom to the selected days
    const box = (await chart.locator(".recharts-cartesian-grid").boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, y, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
    await page.mouse.up();
    await expect(page).toHaveURL(/from=2015-01-(0[89]|1\d)&to=2015-01-(1\d|2\d)/);
    await expect(page).not.toHaveURL(/res=day/);
  });

  test("CSV-Export enthält alle Abschnitte mit Einheiten", async ({ request }) => {
    const res = await request.get(`/api/timeseries?${WEEK}&res=day&regions=Amprion,TenneT&metrics=load,price&format=csv`);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toContain("netzlage_2025-10-23_2025-10-29_day.csv");
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toContain("Wind [MWh]");
    expect(lines[0]).toContain("Day-Ahead-Preis [EUR/MWh Mittel]");
    const dataLines = lines.filter((l) => /^\d{4}-\d{2}-\d{2};/.test(l));
    expect(dataLines).toHaveLength(7); // 7 days, selected zones summed
    expect(dataLines.find((l) => l.startsWith("2025-10-26;Amprion+TenneT"))).toMatch(/;\d+,\d/); // decimal comma
    expect(text).toContain("SMARD.de");
  });

  test("Ansicht speichern und wieder laden", async ({ page, request }) => {
    expect((await request.post("/api/views", { data: { name: "", params: "x" } })).status()).toBe(400);
    const name = `Test-Ansicht ${Date.now()}`;
    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=year&carriers=lignite,hardcoal");
    await page.getByRole("button", { name: "Ansicht speichern" }).click();
    await page.getByLabel("Name der Ansicht").fill(name);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByText(`Ansicht „${name}“ gespeichert.`)).toBeVisible();

    await page.goto("/historie");
    const select = page.getByRole("combobox", { name: "Gespeicherte Ansicht" });
    await select.selectOption({ label: name });
    await expect(page).toHaveURL(/from=2015-01-01&to=2015-12-31&res=year&carriers=lignite%2Chardcoal|carriers=lignite,hardcoal/);
    psql(`DELETE FROM saved_views WHERE name = '${name}'`);
  });

  test("Heatmap: Größe umschalten, Tabellen-Alternative vorhanden", async ({ page }) => {
    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=month");
    await expect(page.getByRole("img", { name: /Heatmap Residuallast 2015/ })).toBeVisible();
    const req = page.waitForResponse((r) => r.url().includes("/api/heatmap?metric=solar&year=2015"));
    await page.locator("#heat-metric").selectOption("solar");
    await req;
    await expect(page).toHaveURL(/heat=solar/);
    await expect(page.getByRole("img", { name: /Heatmap Photovoltaik 2015/ })).toBeVisible();
    const api = await (await page.request.get("/api/heatmap?metric=solar&year=2015")).json();
    expect(api.values).toHaveLength(24);
    expect(api.values[2].filter((v: number | null) => v != null && v > 0.1)).toHaveLength(0); // no PV at 2 a.m.
    expect(Math.max(...api.values[12].filter((v: number | null) => v != null))).toBeGreaterThan(10);
  });
});
