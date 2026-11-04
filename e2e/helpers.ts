import { execFileSync } from "node:child_process";
import { expect, type BrowserContext, type CDPSession, type Page } from "@playwright/test";

/** Runs SQL in the compose database (container has no published port). */
export function psql(sqlText: string): string {
  return execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "netzlage", "-d", "netzlage", "-At", "-c", sqlText], {
    encoding: "utf8",
  }).trim();
}

export function dockerExecApp(args: string[]): string {
  return execFileSync("docker", ["compose", "exec", "-T", "app", ...args], { encoding: "utf8" });
}

/**
 * Attaches a virtual WebAuthn authenticator (platform, resident keys, user verification)
 * so passkey ceremonies complete without user interaction.
 */
export async function addVirtualAuthenticator(page: Page): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

export async function newPageWithAuthenticator(context: BrowserContext) {
  const page = await context.newPage();
  const authenticator = await addVirtualAuthenticator(page);
  return { page, ...authenticator };
}

/** fetch() from inside the page, so the browser sends Origin and cookies like the real UI. */
export async function browserFetch(page: Page, url: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(
    async ({ url, init }) => {
      const res = await fetch(url, {
        method: init.method ?? "GET",
        headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    { url, init },
  );
}

/** Completes the first-run setup in the given page (needs a virtual authenticator). */
export async function setupAdmin(page: Page, name = "Test Admin", email = "admin@example.test") {
  psql(`TRUNCATE "user", session, verification, passkey, registration_tokens, rate_limit CASCADE`);
  await page.goto("/admin/setup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("E-Mail").fill(email);
  await page.getByRole("button", { name: /Account anlegen/ }).click();
  await expect(page.getByText("Der Admin-Account ist eingerichtet")).toBeVisible();
}

export const ORIGIN = { Origin: "http://localhost:3000" };

/**
 * Creates a regular account (e-mail + password) and signs the page's context in.
 * Clears the sign-up rate limit first, since the suite creates several accounts from one IP.
 */
export async function signUpUser(page: Page, name: string, email: string, password = "correct-horse-battery") {
  psql(`DELETE FROM rate_limit`);
  const res = await page.request.post("/api/auth/sign-up/email", { headers: ORIGIN, data: { name, email, password } });
  expect(res.status(), await res.text()).toBe(200);
}
