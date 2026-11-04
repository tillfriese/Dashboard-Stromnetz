import { expect, test } from "@playwright/test";

/* Custom SVG charts show their values on hover (Recharts charts have tooltips already). */

test("Preisbalken zeigen Viertelstunde und Preis beim Überfahren", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByRole("img", { name: /Day-Ahead-Preise in 15-Minuten-Auflösung/ });
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  const tip = chart.locator("..").getByRole("status");
  await expect(tip).toContainText(/\w{2}\.? \d{2}:\d{2}–\d{2}:\d{2}/);
  await expect(tip).toContainText(/-?\d+,\d{2} €\/MWh/);
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(tip).toHaveCount(0);
});

test("Frequenzkurve zeigt Zeitpunkt, Frequenz und Abweichung beim Überfahren", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByRole("img", { name: /Netzfrequenz der letzten 5 Minuten/ });
  await expect(chart).toBeVisible({ timeout: 45_000 }); // first poll after a restart can take a while
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  const tip = chart.locator("..").getByRole("status");
  await expect(tip).toContainText(/\d{2}:\d{2}:\d{2} Uhr/);
  await expect(tip).toContainText(/\d{2},\d{3} Hz/);
  await expect(tip).toContainText(/mHz/);
});

test("Heatmap zeigt Zeitraum, Stunde und Wert beim Überfahren", async ({ page }) => {
  await page.goto("/historie?from=2016-01-01&to=2016-12-31&res=month");
  const chart = page.getByRole("img", { name: /Heatmap Residuallast 2016/ });
  await expect(chart).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const tip = chart.locator("..").getByRole("status");
  await expect(tip).toContainText(/\d{2}\.\d{2}\.–\d{2}\.\d{2}\. · \d{1,2}–\d{1,2} Uhr/);
  await expect(tip).toContainText(/\d+,\d GW/);
});
