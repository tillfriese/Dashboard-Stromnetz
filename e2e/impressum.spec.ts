import { expect, test } from "@playwright/test";

test("Impressum ist über den Footer erreichbar, Datenschutz-Seite gibt es nicht mehr", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Impressum" }).click();
  await expect(page).toHaveURL(/\/impressum$/);
  await expect(page.getByRole("heading", { name: "Impressum", level: 1 })).toBeVisible();
  await expect(page.getByText("studentisches Projekt")).toBeVisible();
  await expect(page.getByText("Till Friese")).toBeVisible();
  await expect(page.getByRole("link", { name: "mail@tillfriese.me" })).toHaveAttribute("href", "mailto:mail@tillfriese.me");
  expect((await request.get("/datenschutz")).status()).toBe(404);
});
