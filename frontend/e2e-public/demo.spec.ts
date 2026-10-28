import { expect, test } from "@playwright/test";

test("public demo works without any API, including deep-link reloads", async ({
  page,
}) => {
  const forbidden: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/api/") || url.hostname !== "127.0.0.1")
      forbidden.push(request.url());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your pipeline failed",
  );
  await expect(
    page.getByRole("link", { name: "Run locally", exact: true }),
  ).toBeVisible();
  const preview = page.getByRole("img", { name: /Actual demo interface/ });
  await expect(preview).toBeVisible();
  expect(
    await preview.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page
    .getByRole("link", { name: "Explore the demo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.getByRole("link", { name: "Inspect pipelines" }).click();
  await page.getByRole("link", { name: "#1048", exact: true }).click();
  await expect(page.locator(".log-view")).toContainText("Dockerfile");
  await page.reload();
  await expect(page.locator(".log-view")).toContainText("Dockerfile");
  await page
    .getByRole("tab", { name: "CI configuration", exact: true })
    .click();
  await expect(page.locator(".ci-source")).toContainText(
    "SIMULATED CI configuration",
  );
  await expect(page.locator(".ci-context")).toContainText("Simulated example");
  await page.getByRole("tab", { name: "Job logs" }).click();
  await page.getByRole("button", { name: "Diagnose this job" }).click();
  await expect(
    page.getByRole("heading", { name: "Dockerfile not found" }),
  ).toBeVisible();
  await page
    .getByLabel("Ask a follow-up question")
    .fill("What should I check?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-assistant")).toContainText(
    "Simulated assistant",
  );
  await page.getByRole("link", { name: "Analysis history" }).click();
  await expect(
    page.getByRole("heading", { name: "Dockerfile not found" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A clean slate." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A demo here. Your pipelines at home." }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue with GitLab" }),
  ).toHaveCount(0);
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

test("static hash routing preserves landing anchors and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#\/#workflow$/);
  await expect(
    page.getByRole("heading", { name: /From “why is it red/ }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("all six simulated failure examples are explorable offline", async ({
  page,
}) => {
  for (let id = 1048; id >= 1043; id--) {
    await page.goto(`./#/pipelines/demo-1/${id}`);
    await expect(page.locator(".log-view")).toContainText(
      "SIMULATED PUBLIC DEMO",
    );
    await page.getByRole("button", { name: "Diagnose this job" }).click();
    await expect(
      page.getByRole("heading", { name: "From red to understood." }),
    ).toBeVisible();
    await expect(page.locator(".evidence")).not.toBeEmpty();
  }
});
