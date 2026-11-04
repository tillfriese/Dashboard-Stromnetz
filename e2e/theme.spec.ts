import { expect, test } from "@playwright/test";

const bodyBg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const isDark = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));

test.describe("Dark Mode", () => {
  test("folgt standardmäßig der Systemeinstellung (zinc-950 im Dark Mode)", async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: "dark" });
    const p1 = await dark.newPage();
    await p1.goto("/");
    expect(await isDark(p1)).toBe(true);
    expect(await bodyBg(p1)).toBe("rgb(9, 9, 11)");
    await dark.close();

    const light = await browser.newContext({ colorScheme: "light" });
    const p2 = await light.newPage();
    await p2.goto("/historie");
    expect(await isDark(p2)).toBe(false);
    expect(await bodyBg(p2)).toMatch(/^(lab\(98|rgb\(248, 250, 252)/); // slate-50 (Tailwind 4 uses lab())
    await light.close();
  });

  test("Umschalter System → Hell → Dunkel, Auswahl bleibt nach Neuladen erhalten", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /Farbschema/ });
    await expect(toggle).toHaveAttribute("aria-label", /Farbschema: System/);

    await toggle.click(); // -> Hell, although the OS is dark
    await expect(toggle).toHaveAttribute("aria-label", /Farbschema: Hell/);
    expect(await isDark(page)).toBe(false);

    await toggle.click(); // -> Dunkel
    await expect(toggle).toHaveAttribute("aria-label", /Farbschema: Dunkel/);
    expect(await isDark(page)).toBe(true);

    await page.reload();
    expect(await isDark(page)).toBe(true); // set before first paint by the head script
    await expect(page.getByRole("button", { name: /Farbschema: Dunkel/ })).toBeVisible();

    await page.getByRole("button", { name: /Farbschema/ }).click(); // -> System (dark OS)
    await expect(page.getByRole("button", { name: /Farbschema/ })).toHaveAttribute("aria-label", /Farbschema: System/);
    expect(await isDark(page)).toBe(true);
    await ctx.close();
  });
});
