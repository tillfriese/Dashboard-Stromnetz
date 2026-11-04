import { expect, test } from "@playwright/test";
import { newPageWithAuthenticator, psql, setupAdmin } from "./helpers";

/* Phase 4: "Jetzt" page with real data (needs data from the scheduler, i.e. a running stack). */

test.describe("Seite „Jetzt“", () => {
  test("API liefert aktuelle Kennzahlen, vier Regelzonen und Grenzflüsse", async ({ request }) => {
    const res = await request.get("/api/now");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("max-age");
    const d = await res.json();
    expect(d.hasData).toBe(true);
    expect(d.kpis.generationMW).toBeGreaterThan(20_000);
    expect(d.kpis.loadMW).toBeGreaterThan(30_000);
    expect(d.zones.map((z: { key: string }) => z.key).sort()).toEqual(["50Hertz", "Amprion", "TenneT", "TransnetBW"]);
    expect(d.mix).toHaveLength(9);
    expect(d.renewable.share).toBeGreaterThan(0);
    expect(d.renewable.share).toBeLessThan(100);
    expect(d.co2.now).toBeGreaterThan(0);
    expect(d.co2.todayMin).toBeLessThanOrEqual(d.co2.now);
    // Zone generation adds up to roughly Germany's generation.
    const sum = d.zones.reduce((a: number, z: { generationMW: number }) => a + z.generationMW, 0);
    expect(Math.abs(sum - d.kpis.generationMW) / d.kpis.generationMW).toBeLessThan(0.1);

    const mix = await (await request.get("/api/mix?window=7d")).json();
    expect(mix.points.length).toBeLessThanOrEqual(5000);
    expect((await request.get("/api/mix?window=1y")).status()).toBe(400);
  });

  test("zeigt Kennzahlen, Karte, Kacheln und Karten der rechten Spalte", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Stromnetz Deutschland", level: 1 })).toBeVisible();
    for (const kpi of ["Erzeugung", "Verbrauch", "Netto-Import"]) {
      await expect(page.locator("dl div", { hasText: kpi }).first()).toContainText(/\d+,\d GW/);
    }
    await expect(page.getByRole("img", { name: /Karte der vier Übertragungsnetzgebiete/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Karte der vier/ }).locator("path[aria-hidden]")).toHaveCount(4);
    await expect(page.getByRole("list", { name: "Regelzonen" }).getByRole("button")).toHaveCount(4);
    await expect(page.locator("#re-title").locator("..")).toContainText("%");
    await expect(page.locator("#co2-title").locator("..")).toContainText("g/kWh");
    await expect(page.locator("#freq-title").locator("../..")).toContainText(/\d{2},\d{3}\s*Hz/, { timeout: 15_000 });
    await expect(page.locator("#price-title").locator("../..")).toContainText("€/MWh");
    await expect(page.getByRole("heading", { name: /Netzampel/ })).toHaveCount(0);
    await expect(page.getByRole("img", { name: /Gestapelte Flächen des Strommixes/ })).toBeVisible();
    // Data status below the title: live indicator, delay and data timestamp
    await expect(page.getByText(/Erzeugung & Last ca\. \d+ (min|h) verzögert/)).toBeVisible();
    await expect(page.getByText(/Datenstand \d{2}:\d{2} Uhr/)).toBeVisible();
    // Navigation: a centred pill with "Jetzt" / "Historie", no full-width top bar.
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Jetzt" })).toHaveAttribute("aria-current", "page");
    const box = (await nav.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(box.width).toBeLessThan(width / 2);
    await nav.getByRole("link", { name: "Historie" }).click();
    await expect(page).toHaveURL(/\/historie/);
    await expect(nav.getByRole("link", { name: "Historie" })).toHaveAttribute("aria-current", "page");
  });

  test("Auswahl einer Regelzone ist zwischen Kacheln und Karte synchron", async ({ page }) => {
    await page.goto("/");
    const tiles = page.getByRole("list", { name: "Regelzonen" });
    const amprion = tiles.getByRole("button", { name: /Amprion/ });
    await amprion.click();
    await expect(amprion).toHaveAttribute("aria-pressed", "true");
    // Selected zone is outlined on the map
    await expect(page.locator('svg path[data-outline="selected"]')).toHaveCount(1);
    // The outline is painted after (above) all zone areas, so no neighbour covers it.
    const order = await page.getByRole("img", { name: /Karte der vier/ }).evaluate((svg) => {
      const paths = [...svg.querySelectorAll("path")];
      const outline = paths.findIndex((p) => p.getAttribute("data-outline") === "selected");
      const lastZone = paths.map((p) => p.hasAttribute("aria-hidden")).lastIndexOf(true);
      return { outline, lastZone };
    });
    expect(order.outline).toBeGreaterThan(order.lastZone);
    // Clicking a zone on the map moves the selection to its tile (paths: 50Hertz, TenneT, Amprion, TransnetBW).
    const map = page.getByRole("img", { name: /Karte der vier/ });
    await map.locator("path[aria-hidden]").nth(3).click();
    await expect(tiles.getByRole("button", { name: /TransnetBW/ })).toHaveAttribute("aria-pressed", "true");
    await expect(amprion).toHaveAttribute("aria-pressed", "false");
    await expect(tiles.getByRole("button", { pressed: true })).toHaveCount(1);
    // Keyboard: tiles are real buttons
    await amprion.focus();
    await page.keyboard.press("Enter");
    await expect(amprion).toHaveAttribute("aria-pressed", "true");
  });

  test("Zeitfenster-Umschalter 24 h / 48 h / 7 Tage", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("radiogroup", { name: "Zeitfenster" });
    await expect(group.getByRole("radio", { name: "48 h" })).toHaveAttribute("aria-checked", "true");
    const reqDone = page.waitForResponse((r) => r.url().includes("/api/mix?window=7d") && r.ok());
    await group.getByRole("radio", { name: "7 Tage" }).click();
    await reqDone;
    await expect(page.locator("#mix-title")).toContainText("letzte 7 Tage");
    await group.getByRole("radio", { name: "24 h" }).click();
    await expect(page.locator("#mix-title")).toContainText("letzte 24 Stunden");
  });

  test("Polling verschiebt das Layout nicht (CLS über einen 60-s-Zyklus)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await page.locator("#freq-title").locator("../..").getByText("Sollwert 50,000 Hz").waitFor({ timeout: 20_000 });
    await page.evaluate(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: false });
    });
    const poll = page.waitForResponse((r) => r.url().endsWith("/api/now"), { timeout: 75_000 });
    await poll;
    await page.waitForTimeout(6_000); // includes at least one frequency poll
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThan(0.01);
  });

  test("PUBLIC_MODE blendet die Preise aus", async ({ browser, request }) => {
    const context = await browser.newContext();
    const { page } = await newPageWithAuthenticator(context);
    await setupAdmin(page, "Now Test", "now@example.test");
    const toggle = async (on: boolean) => {
      await page.goto("/admin/datenquellen");
      const sw = page.getByRole("switch", { name: "Öffentlicher Modus" });
      if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", String(on));
    };
    try {
      await toggle(true);
      expect((await request.get("/api/prices")).status()).toBe(404);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Netzfrequenz" })).toBeVisible();
      await expect(page.locator("#price-title")).toHaveCount(0);
    } finally {
      await toggle(false);
      expect(psql(`SELECT count(*) FROM settings WHERE key = 'app.publicMode'`)).toBe("1");
      expect((await request.get("/api/prices")).status()).toBe(200);
      await context.close();
    }
  });
});
