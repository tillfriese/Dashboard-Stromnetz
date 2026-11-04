import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { newPageWithAuthenticator, psql, setupAdmin } from "./helpers";

/* Phase 7: automated WCAG 2.1 A/AA checks (axe-core) in light and dark mode. */

async function audit(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = r.violations.map((v) => `${label}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`);
  expect(summary, summary.join("\n")).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`öffentliche Seiten ohne WCAG-Verstöße (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    for (const path of ["/", "/historie", "/historie?from=2015-01-01&to=2025-12-31&res=year&cond=price.lt.0", "/impressum", "/gibt-es-nicht", "/admin/setup"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await audit(page, `${scheme} ${path}`);
    }
    await ctx.close();
  });
}

// The admin test creates an account; remove it so later specs start with a fresh first-run setup.
test.afterAll(() => psql(`TRUNCATE "user", session, verification, passkey, registration_tokens, rate_limit CASCADE`));

test("Admin-Bereich ohne WCAG-Verstöße (hell und dunkel)", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const { page } = await newPageWithAuthenticator(ctx);
    await setupAdmin(page, "A11y", "a11y@example.test");
    for (const path of ["/admin/datenquellen", "/admin/datenimport", "/admin/system", "/admin/besucher"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await audit(page, `${scheme} ${path}`);
    }
    await ctx.close();
  }
});
