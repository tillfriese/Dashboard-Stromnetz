import { expect, test } from "@playwright/test";
import { ORIGIN, psql, signUpUser } from "./helpers";

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

  test("zu feine Auflösungen sind ausgegraut und nicht auswählbar", async ({ page }) => {
    await page.goto("/historie?from=2015-01-01&to=2015-12-31");
    const group = page.getByRole("radiogroup", { name: "Auflösung" });
    // 1 year: 15 min (35,040 points) and hour (8,760) exceed 5,000, day (365) does not.
    await expect(group.getByRole("radio", { name: "15 min" })).toBeDisabled();
    await expect(group.getByRole("radio", { name: "Stunde" })).toBeDisabled();
    await expect(group.getByRole("radio", { name: "Tag" })).toBeEnabled();
    await group.getByRole("radio", { name: "Stunde" }).click({ force: true });
    await expect(page).not.toHaveURL(/res=hour/);
    await expect(page.getByText(/Ausgegraute Auflösungen ergäben mehr als ca\. 5\.000 Punkte/)).toBeVisible();

    // 30 days: every resolution is allowed (15 min = 2,880 points).
    await page.goto("/historie?from=2015-01-01&to=2015-01-30");
    await expect(group.getByRole("radio", { name: "15 min" })).toBeEnabled();
    await group.getByRole("radio", { name: "15 min" }).click();
    await expect(page).toHaveURL(/res=15min/);
  });

  test("Regionen: Alle/Keine-Schalter", async ({ page }) => {
    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=month");
    const filters = page.getByRole("complementary", { name: "Filter" });
    const region = filters.locator("section", { has: page.getByRole("heading", { name: "Region" }) });
    await region.getByRole("button", { name: "Keine" }).click();
    await expect(page).toHaveURL(/regions=(&|$)/);
    for (const z of ["50Hertz", "Amprion", "TenneT", "TransnetBW"]) await expect(filters.getByRole("checkbox", { name: `Regelzone ${z}` })).not.toBeChecked();
    await expect(page.getByText("Keine Regelzone ausgewählt.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Aktive Filter" })).toContainText("Keine Regelzone");

    await region.getByRole("button", { name: "Alle" }).click();
    await expect(page).not.toHaveURL(/regions=/);
    for (const z of ["50Hertz", "Amprion", "TenneT", "TransnetBW"]) await expect(filters.getByRole("checkbox", { name: `Regelzone ${z}` })).toBeChecked();
    await expect(region.getByRole("button", { name: "Keine" })).toBeVisible();
  });

  test("eigene Datumsauswahl: Eingabe als TT.MM.JJJJ, Kalender per Maus und Tastatur", async ({ page }) => {
    await page.goto("/historie?from=2025-10-01&to=2025-10-31&res=day");
    const from = page.getByLabel("Von", { exact: true });
    await expect(from).toHaveValue("01.10.2025");

    // Typing in German format
    await from.fill("5.10.2025");
    await from.press("Enter");
    await expect(page).toHaveURL(/from=2025-10-05/);
    // Invalid input is flagged and not applied
    await from.fill("31.02.2025");
    await from.press("Enter");
    await expect(page.getByText("Bitte als TT.MM.JJJJ eingeben.")).toBeVisible();
    await from.press("Escape");
    await expect(from).toHaveValue("05.10.2025");

    // Calendar: opens on the selected day, period highlighted, later days than "Bis" disabled
    await page.getByRole("button", { name: "Von: Kalender öffnen" }).click();
    const dialog = page.getByRole("dialog", { name: "Von wählen" });
    await expect(dialog.getByRole("button", { name: "Sonntag, 5. Oktober 2025" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Samstag, 1. November 2025" })).toBeDisabled();
    // Keyboard: one week back, confirm with Enter
    await page.keyboard.press("ArrowUp");
    await expect(dialog.getByRole("button", { name: "Sonntag, 28. September 2025" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/from=2025-09-28/);
    await expect(page.getByRole("button", { name: "Von: Kalender öffnen" })).toBeFocused();

    // Year jump via select, then pick with the mouse
    await page.getByRole("button", { name: "Von: Kalender öffnen" }).click();
    await dialog.getByLabel("Jahr", { exact: true }).selectOption("2016");
    await dialog.getByLabel("Monat", { exact: true }).selectOption({ label: "Feb" });
    await dialog.getByRole("button", { name: "Montag, 29. Februar 2016" }).click();
    await expect(from).toHaveValue("29.02.2016");
    // The URL follows once the server has rendered ~10 years (can take a few seconds).
    await expect(page).toHaveURL(/from=2016-02-29/, { timeout: 30_000 });
    // Escape closes without change
    await page.getByRole("button", { name: "Bis: Kalender öffnen" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/to=2025-10-31/);
  });

  test("Kalender wird von der Filterspalte nicht abgeschnitten (16:9, Laptop, Handy)", async ({ browser }) => {
    for (const [width, height] of [[1920, 960], [1440, 760], [1280, 640], [375, 700]] as const) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await page.goto("/historie?from=2025-10-06&to=2025-10-24&res=day");
      if (width < 1024) await page.getByRole("button", { name: /^Filter/ }).click();
      for (const name of ["Von", "Bis"]) {
        await page.getByRole("button", { name: `${name}: Kalender öffnen` }).click();
        const dialog = page.getByRole("dialog", { name: `${name} wählen` });
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        expect(box.x, `${width}×${height} ${name}`).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        // Nothing covers the calendar: its corner buttons receive the clicks.
        await expect(dialog.getByRole("button", { name: "Schließen" })).toBeInViewport();
        await dialog.getByRole("button", { name: "Schließen" }).click();
        await expect(dialog).toBeHidden();
      }
      await ctx.close();
    }
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
    // A single control area is read from its own series.
    const d = await (await request.get(`/api/timeseries?${WEEK}&res=day&regions=Amprion&metrics=load`)).json();
    const i = d.main.labels.indexOf("2025-10-26");
    const [sum, count] = d.main.series["smard:load:Amprion"][i];
    expect(count).toBe(100); // 25-hour day
    const raw = psql(`SELECT round(sum(o.value)::numeric, 2), count(*) FROM observations o JOIN series s ON s.id = o.series_id
      WHERE s.key = 'smard:load:Amprion' AND (o.ts AT TIME ZONE 'Europe/Berlin')::date = '2025-10-26'`);
    expect(raw).toBe(`${(Math.round(sum * 100) / 100).toFixed(2)}|100`);
    expect(Object.keys(d.main.series).some((k) => k.endsWith(":DE") && k.startsWith("smard:"))).toBe(false);

    // Default selection = all four control areas: the official Germany total is used (the zone
    // series have gaps in the source, e.g. Amprion "Sonstige Konventionelle" in 2017).
    const all = await (await request.get(`/api/timeseries?${WEEK}&res=day&metrics=load`)).json();
    const smardKeys = Object.keys(all.main.series).filter((k) => k.startsWith("smard:"));
    expect(smardKeys.length).toBeGreaterThan(0);
    expect(smardKeys.every((k) => k.endsWith(":DE"))).toBe(true);
    const de = psql(`SELECT round(sum(o.value)::numeric, 2) FROM observations o JOIN series s ON s.id = o.series_id
      WHERE s.key = 'smard:load:DE' AND (o.ts AT TIME ZONE 'Europe/Berlin')::date = '2025-10-26'`);
    expect(Number(de)).toBeCloseTo(all.main.series["smard:load:DE"][all.main.labels.indexOf("2025-10-26")][0], 1);
  });

  test("alle vier Regelzonen: „Sonstige“ bricht zum 01.01.2017 nicht ein (Lücke in SMARD-Zonendaten)", async ({ request }) => {
    const d = await (await request.get("/api/timeseries?from=2016-12-28&to=2017-01-04&res=day&carriers=other")).json();
    const other = d.main.series["smard:other_conventional:DE"].map((s: [number, number]) => s[0] / s[1]);
    const before = other[d.main.labels.indexOf("2016-12-31")];
    const after = other[d.main.labels.indexOf("2017-01-01")];
    expect(after / before).toBeGreaterThan(0.7);
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
    const windSum = we.main.series["smard:wind_onshore:DE"].reduce((a: number, s: [number, number] | null) => a + (s?.[0] ?? 0), 0);
    const rawWind = Number(
      psql(`SELECT sum(o.value) FROM observations o JOIN series s ON s.id = o.series_id WHERE s.key = 'smard:wind_onshore:DE'
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

  test("Gäste sehen die Vorlagen „Standard“ und „Alle Daten“ und einen Anmelde-Hinweis statt „Speichern“", async ({ page, request }) => {
    expect((await request.post("/api/views", { data: { name: "Gast", params: "res=day" } })).status()).toBe(401);
    expect(await (await request.get("/api/views")).json()).toEqual({ views: [] });

    await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=year");
    await expect(page.getByRole("button", { name: "Ansicht speichern" })).toHaveCount(0);
    await expect(page.getByText("Du bist als Gast unterwegs.")).toBeVisible();
    const signIn = page.getByRole("link", { name: "Anmelden zum Speichern" });
    await expect(signIn).toHaveAttribute("href", /\/anmelden\?next=%2Fhistorie%3Ffrom%3D2015-01-01/);

    // Templates: "Alle Daten" (always up to today) and "Standard" (last 30 days).
    const select = page.getByRole("combobox", { name: "Gespeicherte Ansicht" });
    await select.selectOption({ label: "Alle Daten (seit 2015)" });
    await expect(page).toHaveURL(/from=2015-01-01&to=\d{4}-\d{2}-\d{2}&res=month&metrics=load%2Cresidual%2Cprice%2Cco2%2CnetImport%2Cinstalled/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Installierte Leistung" })).toBeVisible();
    await select.selectOption({ label: "Standard (letzte 30 Tage)" });
    await expect(page).toHaveURL(/\/historie\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}&metrics=$/);
    await expect(page.getByRole("heading", { name: "Netzlast und Residuallast" })).toHaveCount(0);
  });

  test("Ansicht speichern und wieder laden – privat je Konto", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    const stamp = Date.now();
    await signUpUser(a, "Ansichten A", `views-a-${stamp}@example.test`);
    expect((await a.request.post("/api/views", { headers: ORIGIN, data: { name: "", params: "x" } })).status()).toBe(400);

    const name = `Test-Ansicht ${stamp}`;
    await a.goto("/historie?from=2015-01-01&to=2015-12-31&res=year&carriers=lignite,hardcoal");
    await a.getByRole("button", { name: "Ansicht speichern" }).click();
    await a.getByLabel("Name der Ansicht").fill(name);
    await a.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(a.getByText(`Ansicht „${name}“ gespeichert.`)).toBeVisible();

    await a.goto("/historie");
    const select = a.getByRole("combobox", { name: "Gespeicherte Ansicht" });
    await select.selectOption({ label: name });
    await expect(a).toHaveURL(/from=2015-01-01&to=2015-12-31&res=year&carriers=lignite%2Chardcoal|carriers=lignite,hardcoal/);

    // A second account does not see (or delete) A's view.
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await signUpUser(b, "Ansichten B", `views-b-${stamp}@example.test`);
    expect(((await (await b.request.get("/api/views")).json()) as { views: unknown[] }).views).toHaveLength(0);
    await b.goto("/historie");
    await expect(b.getByRole("option", { name })).toHaveCount(0);
    const id = psql(`SELECT id FROM saved_views WHERE name = '${name}'`);
    expect((await b.request.delete(`/api/views?id=${id}`, { headers: ORIGIN })).status()).toBe(404);

    // A deletes it on the account page.
    await a.goto("/konto");
    a.once("dialog", (d) => d.accept());
    await a.getByRole("button", { name: `Ansicht ${name} löschen` }).click();
    await expect(a.getByText("Noch keine Ansichten.")).toBeVisible();
    expect(psql(`SELECT count(*) FROM saved_views WHERE name = '${name}'`)).toBe("0");

    psql(`DELETE FROM "user" WHERE email LIKE 'views-%-${stamp}@example.test'`);
    await ctxA.close();
    await ctxB.close();
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
