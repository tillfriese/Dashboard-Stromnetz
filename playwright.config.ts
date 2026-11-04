import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running stack (default: docker compose on localhost:3000).
 * BETTER_AUTH_URL of that stack must match baseURL, otherwise passkeys are rejected (rpID).
 * WARNING: global setup wipes all admin accounts and settings of that stack.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
