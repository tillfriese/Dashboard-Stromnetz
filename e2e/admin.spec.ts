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
  });

  test("nach dem ersten aktiven Account ist die Registrierung gesperrt", async ({ request }) => {
    expect((await request.get("/admin/setup")).status()).toBe(404);
    expect((await request.post("/api/setup", { data: { name: "Eve", email: "eve@example.test" } })).status()).toBe(404);

    // Better Auth sign-up / password endpoints are disabled.
    const origin = { Origin: "http://localhost:3000" };
    const signUp = await request.post("/api/auth/sign-up/email", {
      headers: origin,
      data: { name: "Eve", email: "eve@example.test", password: "correct-horse-battery" },
    });
    expect(signUp.status()).toBeGreaterThanOrEqual(400);
    const signIn = await request.post("/api/auth/sign-in/email", {
      headers: origin,
      data: { email: ADMIN.email, password: "irrelevant-password" },
    });
    expect(signIn.status()).toBeGreaterThanOrEqual(400);

    // Passkey registration without session and without a valid ticket is refused.
    const options = await request.get("/api/auth/passkey/generate-register-options", { headers: origin });
    expect(options.status()).toBeGreaterThanOrEqual(400);
    const forged = await request.get("/api/auth/passkey/generate-register-options?context=forged-token", { headers: origin });
    expect(forged.status()).toBeGreaterThanOrEqual(400);

    expect(psql(`SELECT count(*) FROM "user"`)).toBe("1");
  });

  test("ohne Session leitet /admin auf den Login um", async ({ browser }) => {
    const anon = await browser.newContext();
    const p = await anon.newPage();
    await p.goto("/admin/system");
    await expect(p).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fsystem/);
    await expect(p.getByLabel(/Passkey auswählen/)).toHaveAttribute("autocomplete", "username webauthn");
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
    await expect(p).toHaveURL(/\/admin\/login/);
    await p.goto("/admin/system");
    await expect(p).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fsystem/);

    await p.getByRole("button", { name: "Mit Passkey anmelden" }).click();
    await expect(p).toHaveURL(/\/admin\/system/);
    await expect(p.getByRole("heading", { name: "Meine Passkeys" })).toBeVisible();
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
    await page.goto("/admin/system");
    const list = await browserFetch(page, "/api/auth/passkey/list-user-passkeys");
    const [only] = JSON.parse(list.text) as { id: string }[];
    const del = await browserFetch(page, "/api/auth/passkey/delete-passkey", { method: "POST", body: { id: only!.id } });
    expect(del.status).toBe(400);
    expect(psql(`SELECT count(*) FROM passkey`)).toBe("1");
  });

  test("zweiten Passkey hinzufügen, umbenennen und wieder löschen", async () => {
    // Same authenticator twice is refused (excludeCredentials) – as on a real device.
    await page.goto("/admin/system");
    await page.getByRole("button", { name: "Passkey hinzufügen" }).click();
    await expect(page.locator("#passkeys").getByRole("alert")).toContainText("bereits ein Passkey registriert");

    // Second "device": new tab with its own virtual authenticator, same session.
    const { page: second } = await newPageWithAuthenticator(context);
    await second.goto("/admin/system");
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
    await expect(device.locator("#passkeys tbody tr")).toHaveCount(2);
    await lost.close();
  });
});
