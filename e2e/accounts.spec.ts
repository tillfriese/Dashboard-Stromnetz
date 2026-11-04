import { expect, test } from "@playwright/test";
import { newPageWithAuthenticator, psql, signUpUser } from "./helpers";

/* Self-service accounts: sign-up by passkey or password, guest access, account menu. */

const RESET = `TRUNCATE "user", session, account, verification, passkey, registration_tokens, rate_limit CASCADE`;
test.beforeAll(() => psql(RESET));
// Later specs (admin) start with an empty user table and test the first-run setup.
test.afterAll(() => psql(RESET));

test("Anmeldeseite bietet „Als Gast fortfahren“ mit Standardfiltern", async ({ page }) => {
  // The header link keeps the full address (filters) as return target.
  await page.goto("/historie?from=2025-01-01&to=2025-12-31&res=month");
  await page.getByRole("link", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/anmelden\?next=%2Fhistorie%3Ffrom%3D2025-01-01%26to%3D2025-12-31%26res%3Dmonth$/);
  await page.getByRole("link", { name: "Als Gast fortfahren" }).click();
  await expect(page).toHaveURL(/\/historie$/);
  await expect(page.getByText("Du bist als Gast unterwegs.")).toBeVisible();
});

test("Registrierung mit Passkey legt einen Nutzer an und meldet an", async ({ browser }) => {
  const ctx = await browser.newContext();
  const { page } = await newPageWithAuthenticator(ctx);
  await page.goto("/anmelden?modus=registrieren&next=/konto");
  await page.getByLabel("Name").fill("Pia Passkey");
  await page.getByLabel("E-Mail").fill("pia@example.test");
  await page.getByRole("button", { name: "Mit Passkey registrieren" }).click();
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByRole("heading", { name: "Hallo, Pia Passkey" })).toBeVisible();
  await expect(page.locator("#passkeys tbody tr")).toHaveCount(1);
  expect(psql(`SELECT role FROM "user" WHERE email = 'pia@example.test'`)).toBe("user");

  // Header menu: keyboard operable (menu button pattern), no admin entry for normal users.
  const menuButton = page.getByRole("button", { name: /Pia Passkey|Konto-Menü/ });
  await menuButton.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Mein Konto" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Abmelden" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Mein Konto" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  await menuButton.click();
  await expect(page.getByRole("menuitem", { name: "Mein Konto" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  // /konto needs a session, so signing out there leads to the start page.
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(page.getByRole("link", { name: "Anmelden", exact: true })).toBeVisible();
  await ctx.close();
});

test("abgebrochene Passkey-Registrierung hinterlässt kein Konto", async ({ request }) => {
  const res = await request.post("/api/registrieren", { data: { name: "Halb", email: "halb@example.test" } });
  expect(res.status()).toBe(200);
  const { token } = await res.json();
  expect((await request.delete("/api/registrieren", { data: { token } })).status()).toBe(204);
  expect(psql(`SELECT count(*) FROM "user" WHERE email = 'halb@example.test'`)).toBe("0");
  // A sign-up ticket is no admin invitation.
  const again = await request.post("/api/registrieren", { data: { name: "Halb", email: "halb@example.test" } });
  const { token: t2 } = await again.json();
  await request.get(`/admin/registrieren?token=${t2}`).then(async (r) => expect(await r.text()).toContain("Link ungültig"));
});

test("Registrierung und Anmeldung mit E-Mail und Passwort", async ({ page }) => {
  await page.goto("/anmelden?modus=registrieren&next=/historie");
  await page.getByLabel("Name").fill("Paul Passwort");
  await page.getByLabel("E-Mail").fill("paul@example.test");
  await page.getByLabel("Passwort", { exact: true }).fill("kurz");
  await page.getByLabel("Passwort wiederholen").fill("kurz");
  await page.getByRole("button", { name: "Mit Passwort registrieren" }).click();
  await expect(page).toHaveURL(/\/anmelden/); // browser validation (minlength) blocks the form
  await page.getByLabel("Passwort", { exact: true }).fill("ein-langes-passwort");
  await page.getByLabel("Passwort wiederholen").fill("ein-langes-passwort");
  await page.getByRole("button", { name: "Mit Passwort registrieren" }).click();
  await expect(page).toHaveURL(/\/historie$/);
  await expect(page.getByRole("button", { name: "Ansicht speichern" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/anmelden?next=/konto");
  await page.getByLabel("E-Mail").fill("paul@example.test");
  await page.getByLabel("Passwort").fill("falsches-passwort");
  await page.getByRole("button", { name: "Mit Passwort anmelden" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("E-Mail oder Passwort ist falsch.");
  await page.getByLabel("Passwort").fill("ein-langes-passwort");
  await page.getByRole("button", { name: "Mit Passwort anmelden" }).click();
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByText("Anmeldung per Passwort.")).toBeVisible();

  // No admin rights: /admin leads to the account page with a hint.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/konto\?hinweis=keine-admin-rechte/);
  await expect(page.getByText("Für den Admin-Bereich fehlen dir die Rechte.")).toBeVisible();
});

test("Namen sind auch über die API auf 100 Zeichen begrenzt; Registrierung antwortet neutral", async ({ request }) => {
  psql(`DELETE FROM rate_limit`);
  const origin = { Origin: "http://localhost:3000" };
  const long = await request.post("/api/auth/sign-up/email", { headers: origin, data: { name: "x".repeat(101), email: "lang@example.test", password: "ein-langes-passwort" } });
  expect(long.status()).toBe(400);
  expect(psql(`SELECT count(*) FROM "user" WHERE email = 'lang@example.test'`)).toBe("0");
  // Address already taken (Paul from the previous test): neutral wording.
  const taken = await request.post("/api/registrieren", { data: { name: "Paul", email: "paul@example.test" } });
  expect(taken.status()).toBe(409);
  expect((await taken.json()).error).toContain("keine Registrierung möglich");
});

test("Weiterleitung nach der Anmeldung nur auf eigene Seiten", async ({ page }) => {
  await signUpUser(page, "Rita Redirect", "rita@example.test", "ein-langes-passwort");
  await page.context().clearCookies();
  await page.goto("/anmelden?next=/%5Cevil.example/x");
  await page.getByLabel("E-Mail").fill("rita@example.test");
  await page.getByLabel("Passwort").fill("ein-langes-passwort");
  await page.getByRole("button", { name: "Mit Passwort anmelden" }).click();
  await expect(page).toHaveURL(/localhost:3000\/konto$/);
});
