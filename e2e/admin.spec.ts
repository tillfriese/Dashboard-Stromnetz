import { expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { browserFetch, dockerExecApp, newPageWithAuthenticator, psql } from "./helpers";

const ADMIN = { name: "Test Admin", email: "admin@example.test" };

test.describe.serial("Admin: Passkey-Login, Ersteinrichtung, Einstellungen", () => {
  let context: BrowserContext;
  let page: Page;
  let mainAuthenticatorId: string;
  let mainCdp: CDPSession;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    ({ page, cdp: mainCdp, authenticatorId: mainAuthenticatorId } = await newPageWithAuthenticator(context));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("ohne Login sind /admin und /api/admin/* nicht erreichbar", async ({ request }) => {
    expect((await request.get("/api/admin/settings")).status()).toBe(401);
    expect((await request.put("/api/admin/settings", { data: { publicMode: true } })).status()).toBe(401);
    expect((await request.post("/api/admin/settings/test", { data: { source: "smard" } })).status()).toBe(401);
    expect((await request.post("/api/admin/invites", { data: ADMIN })).status()).toBe(401);

    // No account yet: the admin area leads to the setup.
    await page.goto("/admin/datenquellen");
    await expect(page).toHaveURL(/\/admin\/setup$/);
  });

  test("abgebrochene Ersteinrichtung hinterlässt keinen Account", async ({ request }) => {
    const res = await request.post("/api/setup", { data: { name: "Halb", email: "halb@example.test" } });
    expect(res.status()).toBe(200);
    const { token } = await res.json();
    expect(psql(`SELECT count(*) FROM "user"`)).toBe("1");
    expect((await request.delete("/api/setup", { data: { token } })).status()).toBe(204);
    expect(psql(`SELECT count(*) FROM "user"`)).toBe("0");
  });

  test("Ersteinrichtung registriert den ersten Passkey und meldet an", async () => {
    // Someone claimed the admin address with a normal (unverified) account beforehand:
    // the first-run setup replaces that account instead of refusing the address.
    psql(`DELETE FROM rate_limit`);
    const squat = await page.request.post("/api/auth/sign-up/email", {
      headers: { Origin: "http://localhost:3000" },
      data: { name: "Squatter", email: ADMIN.email, password: "squatter-password" },
    });
    expect(squat.status()).toBe(200);
    await context.clearCookies();
    await page.goto("/admin/setup");
    await page.getByLabel("Name").fill(ADMIN.name);
    await page.getByLabel("E-Mail").fill(ADMIN.email);
    await page.getByRole("button", { name: /Account anlegen/ }).click();
    await expect(page.getByText("Der Admin-Account ist eingerichtet")).toBeVisible();
    await expect(page.getByText(/zweiten Passkey/).first()).toBeVisible();
    expect(psql(`SELECT count(*) FROM passkey`)).toBe("1");

    // Session cookie: httpOnly, SameSite=Lax (secure only behind HTTPS).
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    // Session expires after 12 h (sliding with activity).
    const hours = Number(psql(`SELECT round(extract(epoch FROM max(expires_at) - now()) / 3600) FROM session`));
    expect(hours).toBe(12);

    await page.goto("/admin/datenquellen");
    await expect(page.getByRole("heading", { name: "Datenquellen", level: 1 })).toBeVisible();
    // Admins find the admin area in the navigation pill (marked as current page).
    await page.goto("/");
    const adminTab = page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Admin" });
    await adminTab.click();
    await expect(page).toHaveURL(/\/admin\//);
    await expect(adminTab).toHaveAttribute("aria-current", "page");
  });

  test("nach dem ersten Admin ist die Ersteinrichtung gesperrt, Registrierungen erhalten nur die Rolle Nutzer", async ({ request, playwright }) => {
    expect((await request.get("/admin/setup")).status()).toBe(404);
    expect((await request.post("/api/setup", { data: { name: "Eve", email: "eve@example.test" } })).status()).toBe(404);

    // Open sign-up with e-mail and password: always role "user", even if a role is sent along.
    const origin = { Origin: "http://localhost:3000" };
    const signUp = await request.post("/api/auth/sign-up/email", {
      headers: origin,
      data: { name: "Eve", email: "eve@example.test", password: "correct-horse-battery", role: "admin" },
    });
    expect(signUp.status()).toBe(200);
    expect(psql(`SELECT role FROM "user" WHERE email = 'eve@example.test'`)).toBe("user");
    expect(psql(`SELECT password FROM account WHERE user_id = (SELECT id FROM "user" WHERE email = 'eve@example.test')`)).not.toContain("correct-horse");
    // Same e-mail twice is refused.
    const again = await request.post("/api/auth/sign-up/email", { headers: origin, data: { name: "Eve 2", email: "eve@example.test", password: "another-password-1" } });
    expect(again.status()).toBeGreaterThanOrEqual(400);

    // A regular user has no admin rights: 403 on the API, redirect to the account page in the browser.
    expect((await request.get("/api/admin/settings")).status()).toBe(403);
    expect((await request.get("/api/admin/users")).status()).toBe(403);
    const adminPage = await request.get("/admin/system", { maxRedirects: 0 });
    expect(adminPage.status()).toBe(307);
    expect(adminPage.headers().location).toContain("/konto?hinweis=keine-admin-rechte");

    // Wrong password is refused.
    const signIn = await request.post("/api/auth/sign-in/email", { headers: origin, data: { email: ADMIN.email, password: "irrelevant-password" } });
    expect(signIn.status()).toBeGreaterThanOrEqual(400);

    // Passkey registration without session and without a valid ticket is refused.
    const anon = await playwright.request.newContext({ baseURL: "http://localhost:3000" });
    const options = await anon.get("/api/auth/passkey/generate-register-options", { headers: origin });
    expect(options.status()).toBeGreaterThanOrEqual(400);
    const forged = await anon.get("/api/auth/passkey/generate-register-options?context=forged-token", { headers: origin });
    expect(forged.status()).toBeGreaterThanOrEqual(400);
    await anon.dispose();

    expect(psql(`SELECT count(*) FROM "user"`)).toBe("2");
  });

  test("Admin befördert einen Nutzer, kann sich aber nicht selbst die Rechte entziehen", async ({ browser }) => {
    await page.goto("/admin/nutzer");
    const row = page.locator("tr", { hasText: "eve@example.test" });
    await expect(row).toContainText("Nutzer");
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Zum Admin befördern" }).click();
    await expect(page.getByText("Eve ist jetzt Admin.")).toBeVisible();
    expect(psql(`SELECT role FROM "user" WHERE email = 'eve@example.test'`)).toBe("admin");

    // Eve now reaches the admin area with her password.
    const ctx = await browser.newContext();
    const eve = await ctx.newPage();
    await eve.goto("/anmelden?next=/admin/system");
    await eve.getByLabel("E-Mail").fill("eve@example.test");
    await eve.getByLabel("Passwort").fill("correct-horse-battery");
    await eve.getByRole("button", { name: "Mit Passwort anmelden" }).click();
    await expect(eve).toHaveURL(/\/admin\/system/);
    await expect(eve.getByRole("heading", { name: "System", level: 1 })).toBeVisible();

    // Self-demotion is refused; demoting another admin works.
    const meId = psql(`SELECT id FROM "user" WHERE email = '${ADMIN.email}'`);
    const eveId = psql(`SELECT id FROM "user" WHERE email = 'eve@example.test'`);
    expect((await browserFetch(page, "/api/admin/users", { method: "PATCH", body: { id: meId, role: "user" } })).status).toBe(409);
    expect((await browserFetch(page, "/api/admin/users", { method: "PATCH", body: { id: eveId, role: "user" } })).status).toBe(200);
    // Demoted: Eve's session immediately loses access.
    expect((await browserFetch(eve, "/api/admin/settings")).status).toBe(403);
    await ctx.close();

    // A pending invitation (admin without passkey) does not count as remaining admin, and an actor
    // who lost the admin role meanwhile is refused even with an old, already authorised request.
    psql(`INSERT INTO "user" (id, name, email, role) VALUES ('pending-admin', 'Pending', 'pending@example.test', 'admin')`);
    psql(`UPDATE "user" SET role = 'admin' WHERE id = '${eveId}'`);
    psql(`UPDATE "user" SET role = 'user' WHERE id = '${meId}'`);
    expect((await browserFetch(page, "/api/admin/users", { method: "PATCH", body: { id: eveId, role: "user" } })).status).toBe(403);
    psql(`UPDATE "user" SET role = 'admin' WHERE id = '${meId}'`);
    psql(`UPDATE "user" SET role = 'user' WHERE id = '${eveId}'`);
    psql(`DELETE FROM "user" WHERE id = 'pending-admin'`);

    // Delete the account again (cascades to sessions and views).
    expect((await browserFetch(page, `/api/admin/users?id=${encodeURIComponent(eveId)}`, { method: "DELETE" })).status).toBe(204);
    expect((await browserFetch(page, `/api/admin/users?id=${encodeURIComponent(meId)}`, { method: "DELETE" })).status).toBe(409);
    expect(psql(`SELECT count(*) FROM "user"`)).toBe("1");
  });

  test("ohne Session leitet /admin auf den Login um", async ({ browser }) => {
    const anon = await browser.newContext();
    const p = await anon.newPage();
    await p.goto("/admin/system");
    await expect(p).toHaveURL(/\/anmelden\?next=%2Fadmin%2Fsystem/);
    await expect(p.getByLabel("E-Mail")).toHaveAttribute("autocomplete", "username webauthn");
    // The old admin login address forwards to the common sign-in page.
    await p.goto("/admin/login");
    await expect(p).toHaveURL(/\/anmelden\?next=%2Fadmin$/);
    await anon.close();
  });

  test("Abmelden und erneutes Anmelden per Button „Mit Passkey anmelden“", async ({ browser }) => {
    // Separate context with conditional UI switched off, so only the button path is exercised.
    const ctx = await browser.newContext({ storageState: await context.storageState() });
    await ctx.addInitScript(() => {
      Object.defineProperty(PublicKeyCredential, "isConditionalMediationAvailable", { value: async () => false });
    });
    const { page: p, cdp, authenticatorId } = await newPageWithAuthenticator(ctx);
    // Re-use the credential of the main authenticator.
    const { credentials } = await mainCdp.send("WebAuthn.getCredentials", { authenticatorId: mainAuthenticatorId });
    for (const credential of credentials) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });

    await p.goto("/admin/system");
    await p.getByRole("button", { name: "Abmelden" }).click();
    await expect(p).toHaveURL(/\/anmelden$/);
    await p.goto("/admin/system");
    await expect(p).toHaveURL(/\/anmelden\?next=%2Fadmin%2Fsystem/);

    await p.getByRole("button", { name: "Mit Passkey anmelden" }).click();
    await expect(p).toHaveURL(/\/admin\/system/);
    await expect(p.getByRole("heading", { name: "System", level: 1 })).toBeVisible();
    expect(psql(`SELECT count(*) FROM passkey WHERE last_used_at IS NOT NULL`)).toBe("1");

    // Copy the credential (with its increased signature counter) back, otherwise the server's
    // clone detection would rightly reject the main authenticator's lower counter.
    const updated = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    await mainCdp.send("WebAuthn.clearCredentials", { authenticatorId: mainAuthenticatorId });
    for (const credential of updated.credentials) {
      await mainCdp.send("WebAuthn.addCredential", { authenticatorId: mainAuthenticatorId, credential });
    }
    await ctx.close();
  });

  test("Anmelden per Conditional UI (Passkey-Vorschlag im Autofill)", async () => {
    // The session of the main page was ended by the previous test.
    await context.clearCookies();
    expect((await browserFetch(page, "/api/admin/settings")).status).toBe(401);
    // The login page starts the conditional (autofill) request on its own, without any click.
    // The virtual authenticator confirms it automatically, like a user picking the suggestion.
    const conditionalRequest = page.waitForRequest((r) => r.url().includes("/passkey/generate-authenticate-options"));
    const verified = page.waitForResponse((r) => r.url().includes("/passkey/verify-authentication"));
    await page.goto("/admin/login");
    expect(await page.evaluate(() => PublicKeyCredential.isConditionalMediationAvailable?.())).toBe(true);
    await conditionalRequest;
    expect((await verified).status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/datenquellen/);
    expect((await browserFetch(page, "/api/admin/settings")).status).toBe(200);
  });

  test("der letzte Passkey kann nicht gelöscht werden", async () => {
    await page.goto("/konto");
    const list = await browserFetch(page, "/api/auth/passkey/list-user-passkeys");
    const [only] = JSON.parse(list.text) as { id: string }[];
    const del = await browserFetch(page, "/api/auth/passkey/delete-passkey", { method: "POST", body: { id: only!.id } });
    expect(del.status).toBe(400);
    expect(psql(`SELECT count(*) FROM passkey`)).toBe("1");
  });

  test("zweiten Passkey hinzufügen, umbenennen und wieder löschen", async () => {
    // Same authenticator twice is refused (excludeCredentials) – as on a real device.
    await page.goto("/konto");
    await page.getByRole("button", { name: "Passkey hinzufügen" }).click();
    await expect(page.locator("#passkeys").getByRole("alert")).toContainText("bereits ein Passkey registriert");

    // Second "device": new tab with its own virtual authenticator, same session.
    const { page: second } = await newPageWithAuthenticator(context);
    await second.goto("/konto");
    await second.getByRole("button", { name: "Passkey hinzufügen" }).click();
    await expect(second.locator("#passkeys tbody tr")).toHaveCount(2);
    await second.close();

    await page.reload();
    await expect(page.locator("#passkeys tbody tr")).toHaveCount(2);
    await page.locator("#passkeys tbody tr").first().getByRole("button", { name: "Umbenennen" }).click();
    await page.getByLabel("Neuer Name").fill("MacBook");
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#passkeys")).toContainText("MacBook");

    page.once("dialog", (d) => d.accept());
    await page.locator("#passkeys tbody tr", { hasText: "MacBook" }).getByRole("button", { name: "Löschen" }).click();
    await expect(page.locator("#passkeys tbody tr")).toHaveCount(1);
  });

  test("Token setzen, echt testen und nur maskiert anzeigen", async () => {
    const token = "invalid-e2e-token-0000abcd";
    await page.goto("/admin/datenquellen");
    const card = page.locator("section", { has: page.getByRole("heading", { name: "ENTSO-E Transparency" }) });

    await card.getByLabel("Token").fill(token);
    await card.getByRole("button", { name: "Eingabe testen" }).click();
    // Real request against ENTSO-E: a made-up token must be rejected.
    await expect(card.getByRole("alert")).toContainText("Token ungültig", { timeout: 20_000 });

    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(card).toContainText("••••abcd");
    await expect(card).toContainText("gespeichert");

    const api = await browserFetch(page, "/api/admin/settings");
    expect(api.text).not.toContain(token);
    expect(api.text).toContain("••••abcd");

    const stored = psql(`SELECT value_encrypted FROM settings WHERE key = 'entsoe.token'`);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("abcd");

    await page.reload();
    await expect(card).toContainText("••••abcd");
    await expect(page.locator("body")).not.toContainText(token);
  });

  test("StromGedacht-PLZ setzen und Verbindung testen", async () => {
    await page.goto("/admin/datenquellen");
    const card = page.locator("section", { has: page.getByRole("heading", { name: "StromGedacht (TransnetBW)" }) });
    await card.getByLabel(/Postleitzahl/).fill("70173");
    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(card).toContainText("Aktuell: 70173 (gespeichert)");
    await card.getByRole("button", { name: "Verbindung testen" }).click();
    await expect(card.getByRole("status").last()).toContainText("PLZ 70173", { timeout: 20_000 });
  });

  test("Einladung: eingeladene Person registriert ihren Passkey über den Link", async ({ browser }) => {
    await page.goto("/admin/system");
    await page.getByLabel("Name", { exact: true }).fill("Zweite Admin");
    await page.getByLabel("E-Mail").fill("zweite@example.test");
    await page.getByRole("button", { name: "Link erzeugen" }).click();
    const link = await page.getByLabel("Einladungslink").inputValue();
    expect(link).toContain("/admin/registrieren?token=");

    const other = await browser.newContext();
    const { page: invitee } = await newPageWithAuthenticator(other);
    await invitee.goto(link);
    await expect(invitee.getByText("Zweite Admin")).toBeVisible();
    await invitee.getByRole("button", { name: "Passkey registrieren" }).click();
    await expect(invitee).toHaveURL(/\/admin\/system/);

    // The link is single-use.
    await invitee.goto(link);
    await expect(invitee.getByText("Link ungültig")).toBeVisible();
    await other.close();
  });

  test("Notfall: admin:recovery erzeugt einen einmaligen Link", async ({ browser }) => {
    const out = dockerExecApp(["npm", "run", "--silent", "admin:recovery", "--", ADMIN.email]);
    const link = out.match(/https?:\/\/\S+\/admin\/registrieren\?token=\S+/)?.[0];
    expect(link).toBeTruthy();

    const lost = await browser.newContext();
    const { page: device } = await newPageWithAuthenticator(lost);
    await device.goto(link!);
    await expect(device.getByRole("heading", { name: "Zugang wiederherstellen" })).toBeVisible();
    await device.getByRole("button", { name: "Passkey registrieren" }).click();
    await expect(device).toHaveURL(/\/admin\/system/);
    await device.goto("/konto");
    await expect(device.locator("#passkeys tbody tr")).toHaveCount(2);
    await lost.close();
  });
});
