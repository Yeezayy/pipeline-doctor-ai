import { expect, test } from "@playwright/test";

test("demo: pipeline → sanitized trace → diagnosis → chat → history", async ({
  page,
}) => {
  const errors: string[] = [];
  // Reproduce a fresh workspace cache even if the developer has saved demo analyses.
  await page.route(
    "**/api/analyses",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: [] });
      } else {
        await route.continue();
      }
    },
    { times: 1 },
  );
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Less firefighting. More shipping." }),
  ).toBeVisible();
  await expect(
    page.getByText("Pipelines, logs and AI responses are simulated."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inspect pipelines" }).click();
  await page.getByRole("link", { name: "#1048", exact: true }).click();
  await expect(page.locator(".log-view")).toContainText(
    "open Dockerfile: no such file or directory",
  );
  await page.getByRole("button", { name: "Diagnose this job" }).click();
  await expect(
    page.getByRole("heading", { name: "Dockerfile not found" }),
  ).toBeVisible();
  await expect(page.getByText("Nothing has been changed.")).toBeVisible();
  await page
    .getByLabel("Ask a follow-up question")
    .fill("What should I check before retrying?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-assistant")).toContainText(
    "Simulated assistant",
  );
  await page.getByRole("link", { name: "Analysis history" }).click();
  await expect(
    page.getByRole("heading", { name: "Dockerfile not found" }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile navigation and settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connected, on your terms." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(
    page.getByText("Simulated connection; no external requests"),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("recover from an API key challenge without reloading the page", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    if (
      route.request().headers()["authorization"] !== "Bearer browser-test-key"
    ) {
      await route.fulfill({
        status: 401,
        json: { detail: "API key required; enter it in Settings" },
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/settings");
  await page.getByLabel("Application API key").fill("browser-test-key");
  await page.getByRole("button", { name: "Save for this tab" }).click();
  await expect(
    page.getByText("Demo · fixtures only", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(
    page.getByText("Simulated connection; no external requests"),
  ).toBeVisible();
});
