import { expect, test, type APIRequestContext } from "@playwright/test";
import { newPageWithAuthenticator, psql, setupAdmin } from "./helpers";

/*
 * Phase 6: cookieless visitor statistics.
 * Automated browsers set navigator.webdriver and are not counted, so "real" visitors are simulated
 * with a regular user agent and navigator.webdriver hidden.
 */

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

const reset = () => psql(`TRUNCATE visits, visit_events`);

/** A "human" browser: regular UA and navigator.webdriver hidden (automation is filtered as bot). */
async function humanContext(browser: import("@playwright/test").Browser, extra: Parameters<import("@playwright/test").Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext({ userAgent: CHROME, ...extra });
  await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  return ctx;
}
const count = (sql: string) => Number(psql(sql));

async function waitFor(fn: () => boolean, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("condition not met in time");
}

/** Removes test visits again, including the already materialised aggregate buckets. */
function cleanup() {
  reset();
  psql(`CALL refresh_continuous_aggregate('visits_hourly', now() - interval '3 days', now() + interval '1 hour')`);
  psql(`CALL refresh_continuous_aggregate('visit_events_daily', now() - interval '3 days', now() + interval '1 day')`);
}

test.describe.serial("Besucherstatistik", () => {
  test.afterAll(() => cleanup());

  test("echter Besuch: keine Cookies, keine IP, keine vollständige Browserkennung gespeichert", async ({ browser }) => {
    reset();
    const ctx = await humanContext(browser, { extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.23" } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("list", { name: "Regelzonen" }).getByRole("button", { name: /Amprion/ }).click();
    await page.getByRole("link", { name: "Historie" }).click();
    await expect(page).toHaveURL(/\/historie/);
    // Beacons are asynchronous and may arrive in any order: wait for both page views and the click.
    await waitFor(
      () =>
        count(`SELECT coalesce(max(pageviews), 0) FROM visits`) >= 2 &&
        count(`SELECT count(*) FROM visit_events WHERE type = 'event' AND name = 'zone_click'`) >= 1,
    );

    expect(await ctx.cookies()).toEqual([]); // no cookie at all on the public site
    const ls = await page.evaluate(() => Object.keys(localStorage));
    expect(ls.filter((k) => k !== "netzlage-theme")).toEqual([]); // no identifiers in the browser

    expect(count(`SELECT count(*) FROM visits`)).toBe(1);
    expect(count(`SELECT count(*) FROM visits v WHERE v::text LIKE '%198.51.100.23%'`)).toBe(0);
    expect(count(`SELECT count(*) FROM visit_events e WHERE e::text LIKE '%198.51.100.23%'`)).toBe(0);
    expect(count(`SELECT count(*) FROM visits v WHERE v::text LIKE '%Mozilla%' OR v::text LIKE '%AppleWebKit%'`)).toBe(0);
    expect(psql(`SELECT device || '|' || browser || '|' || browser_version || '|' || os FROM visits`)).toBe("desktop|Chrome|141|macOS");
    expect(count(`SELECT count(*) FROM visit_events WHERE type = 'event' AND name = 'zone_click' AND props->>'value' = 'Amprion'`)).toBe(1);
    await ctx.close();
  });

  test("Bots, Do-Not-Track und der Admin-Bereich werden nicht gezählt", async ({ browser, request }) => {
    reset();
    // Automated browser (navigator.webdriver = true, as in every Playwright/Selenium session) = bot
    const bot = await browser.newContext();
    const p = await bot.newPage();
    await p.goto("/");
    await p.waitForTimeout(1500);
    await bot.close();
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "curl/8.7.1"]) {
      await request.post("/api/collect", { headers: { "User-Agent": ua }, data: JSON.stringify({ type: "pageview", path: "/" }) });
    }
    // Do Not Track / Global Privacy Control
    await request.post("/api/collect", { headers: { "User-Agent": CHROME, DNT: "1" }, data: JSON.stringify({ type: "pageview", path: "/" }) });
    await request.post("/api/collect", { headers: { "User-Agent": CHROME, "Sec-GPC": "1" }, data: JSON.stringify({ type: "pageview", path: "/" }) });
    // Admin pages: the tracker is not active there and the collector rejects /admin paths
    const human = await humanContext(browser);
    const a = await human.newPage();
    await a.goto("/admin/login");
    await a.waitForTimeout(1500);
    await request.post("/api/collect", { headers: { "User-Agent": CHROME }, data: JSON.stringify({ type: "pageview", path: "/admin/system" }) });
    await human.close();

    expect(count(`SELECT count(*) FROM visits`)).toBe(0);
    expect(count(`SELECT count(*) FROM visit_events`)).toBe(0);
  });

  test("Auswertung im Tab „Besucher“ stimmt mit einem Testlauf überein", async ({ browser, request }) => {
    reset();
    const beacon = (r: APIRequestContext, ua: string, ip: string, body: unknown) =>
      r.post("/api/collect", { headers: { "User-Agent": ua, "X-Forwarded-For": ip, "Content-Type": "text/plain" }, data: JSON.stringify(body) });
    // Session A: 2 page views + zone click (desktop, from google)
    await beacon(request, CHROME, "192.0.2.1", { type: "pageview", path: "/", referrer: "https://www.google.com/" });
    await beacon(request, CHROME, "192.0.2.1", [
      { type: "event", path: "/", name: "zone_click", label: "Amprion" },
      { type: "pageview", path: "/historie" },
    ]);
    // Session B: bounce (1 page view)
    await beacon(request, CHROME, "192.0.2.2", { type: "pageview", path: "/" });
    // Session C: mobile, history with a carrier filter
    await beacon(request, IPHONE, "192.0.2.3", [
      { type: "pageview", path: "/historie", screen: "mobile" },
      { type: "event", path: "/historie", name: "history_carrier", label: "wind" },
    ]);
    expect(count(`SELECT count(*) FROM visits`)).toBe(3);

    const ctx = await browser.newContext();
    const { page } = await newPageWithAuthenticator(ctx);
    await setupAdmin(page, "Stats Test", "stats@example.test");
    const d = await (await page.request.get(`/api/admin/stats?from=${today()}&to=${today()}`)).json();
    expect(d.kpis.sessions).toBe(3);
    expect(d.kpis.pageviews).toBe(4);
    expect(d.kpis.bounceRate).toBeCloseTo((2 / 3) * 100, 5);
    expect(d.rankings.pages).toEqual(expect.arrayContaining([{ label: "/", count: 2 }, { label: "/historie", count: 2 }]));
    expect(d.rankings.zones).toEqual([{ label: "Amprion", count: 1 }]);
    expect(d.rankings.carriers).toEqual([{ label: "wind", count: 1 }]);
    expect(d.rankings.referrers).toEqual(expect.arrayContaining([{ label: "google.com", count: 1 }]));
    expect(d.rankings.devices).toEqual(expect.arrayContaining([{ label: "desktop", count: 2 }, { label: "mobile", count: 1 }]));
    expect(d.heatmap.flat().reduce((a: number, b: number) => a + b, 0)).toBe(3);

    // The admin's own browsing is not counted.
    await page.goto("/");
    await page.waitForTimeout(1500);
    expect(count(`SELECT count(*) FROM visits`)).toBe(3);

    // UI
    await page.goto("/admin/besucher");
    await page.getByRole("radio", { name: "Heute" }).click();
    const kpis = page.locator("dl").first();
    await expect(kpis).toContainText("Besucher (Sitzungen)");
    await expect(kpis.locator("div", { hasText: "Besucher (Sitzungen)" })).toContainText("3");
    await expect(kpis.locator("div", { hasText: "Absprungrate" })).toContainText("66,7 %");
    await expect(page.getByRole("img", { name: /Heatmap der Sitzungen/ })).toBeVisible();

    // Session timeline
    const sessions = page.locator("section", { has: page.getByRole("heading", { name: "Sitzungen" }) });
    await expect(sessions.locator("tbody tr")).toHaveCount(3);
    await sessions.locator("tbody tr", { hasText: "/ → /historie" }).getByRole("button").click();
    await expect(sessions.getByText("Zeitleiste der Sitzung")).toBeVisible();
    await expect(sessions.locator("ol li")).toHaveCount(3);

    // CSV export
    const csv = await (await page.request.get(`/api/admin/stats/export?from=${today()}&to=${today()}`)).text();
    expect(csv.trim().split("\r\n")).toHaveLength(4); // header + 3 sessions
    expect(csv).not.toContain("192.0.2.");

    // Retention setting changes the Timescale policy
    const put = await page.request.put("/api/admin/stats/retention", { data: { days: 30 } });
    expect(put.status()).toBe(200);
    expect(psql(`SELECT config->>'drop_after' FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention' AND hypertable_name = 'visits'`)).toBe("30 days");
    await page.request.put("/api/admin/stats/retention", { data: { days: 90 } });
    await ctx.close();
  });
});
