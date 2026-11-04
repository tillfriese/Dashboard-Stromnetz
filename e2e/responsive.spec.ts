import { expect, test } from "@playwright/test";
import { newPageWithAuthenticator, psql, setupAdmin } from "./helpers";

/* Phase 7: no horizontal page scrolling from phone to desktop; collapsible filters on phones. */

const PAGES = ["/", "/historie", "/historie?from=2015-01-01&to=2025-12-31&res=year&metrics=load,price,co2,netImport,installed", "/impressum", "/admin/setup"];

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`kein horizontales Scrollen bei ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} @ ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("Filter der Historie sind auf dem Handy einklappbar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/historie?cond=price.lt.0&metrics=");
  const toggle = page.getByRole("button", { name: /^Filter/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("1 aktiv");
  await expect(page.getByRole("complementary", { name: "Filter" })).toBeHidden();
  // Content (KPIs, chart) comes first instead of the long filter column
  await expect(page.getByRole("heading", { name: "Daten erkunden" })).toBeInViewport();
  await toggle.click();
  await expect(page.getByRole("complementary", { name: "Filter" })).toBeVisible();
  // Desktop: always visible, no toggle
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(toggle).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Filter" })).toBeVisible();
});

test("unbekannte Adresse zeigt eine deutsche 404-Seite", async ({ page }) => {
  const res = await page.goto("/gibt-es-nicht");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aktuelle Lage" })).toHaveAttribute("href", "/");
});

test("Kopfzeile: Pill und Konto-Schalter überlappen auf dem Handy nicht (Gast und Admin)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const { page } = await newPageWithAuthenticator(ctx);
  const noOverlap = async () => {
    const nav = (await page.getByRole("navigation", { name: "Hauptnavigation" }).boundingBox())!;
    const right = (await page.getByRole("button", { name: /Farbschema/ }).locator("..").boundingBox())!;
    expect(nav.x + nav.width).toBeLessThanOrEqual(right.x);
    expect(right.x + right.width).toBeLessThanOrEqual(360);
  };
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Anmelden" })).toBeVisible();
  await noOverlap();
  await setupAdmin(page, "Mobil Admin", "mobil@example.test");
  await page.goto("/historie");
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Admin" })).toBeVisible();
  await noOverlap();
  await page.screenshot({ path: "test-results/header-mobile-admin.png" });
  psql(`TRUNCATE "user", session, verification, passkey, registration_tokens, rate_limit CASCADE`);
  await ctx.close();
});
