import { expect, test } from "@playwright/test";

/* Phase 7: keyboard operation (skip link, every filter reachable, visible focus, radio groups). */

test("Skip-Link springt direkt zum Inhalt", async ({ page }) => {
  await page.goto("/historie");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#inhalt$/);
});

test("alle Filter der Historie sind per Tab erreichbar und zeigen einen Fokusring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/historie?from=2015-01-01&to=2015-12-31");
  await page.getByRole("button", { name: "+ Bedingung hinzufügen" }).click(); // adds a condition with its own controls
  await page.locator("body").click({ position: { x: 1, y: 1 } });

  const aside = page.getByRole("complementary", { name: "Filter" });
  // Mark every enabled interactive element of the filter column with a unique index.
  const expected = await aside.evaluate((el) => {
    const nodes = [...el.querySelectorAll<HTMLElement>("a[href], button, input, select, [tabindex]")].filter(
      (n) => !(n as HTMLButtonElement).disabled && n.tabIndex >= 0,
    );
    nodes.forEach((n, i) => (n.dataset.k = String(i)));
    return nodes.length;
  });

  const seen = new Set<string>();
  const noRing: string[] = [];
  for (let i = 0; i < 200 && seen.size < expected; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a?.dataset.k) return null;
      const s = getComputedStyle(a);
      return { k: a.dataset.k, ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0, label: (a.textContent || a.getAttribute("aria-label") || a.tagName).trim().slice(0, 30) };
    });
    if (!info || seen.has(info.k)) continue;
    seen.add(info.k);
    if (!info.ring) noRing.push(info.label);
  }
  expect(seen.size).toBe(expected);
  expect(noRing, `ohne sichtbaren Fokus: ${noRing.join(", ")}`).toEqual([]);
});

test("Auflösung per Pfeiltasten, gesperrte Stufen werden übersprungen", async ({ page }) => {
  await page.goto("/historie?from=2015-01-01&to=2015-12-31&res=day");
  const group = page.getByRole("radiogroup", { name: "Auflösung" });
  const day = group.getByRole("radio", { name: "Tag" });
  await day.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/res=week/);
  await expect(group.getByRole("radio", { name: "Woche" })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); // back to "Tag"
  await expect(page).toHaveURL(/res=day/);
  await page.keyboard.press("ArrowLeft"); // "Stunde" and "15 min" are disabled for one year -> wraps to "Jahr"
  await expect(page).toHaveURL(/res=year/);
  // Only one tab stop inside the group
  expect(await group.locator('[role="radio"][tabindex="0"]').count()).toBe(1);
});

test("Zeitfenster des Strommixes per Pfeiltasten", async ({ page }) => {
  await page.goto("/");
  const group = page.getByRole("radiogroup", { name: "Zeitfenster" });
  await group.getByRole("radio", { name: "48 h" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "7 Tage" })).toHaveAttribute("aria-checked", "true");
  await expect(group.getByRole("radio", { name: "7 Tage" })).toBeFocused();
});
