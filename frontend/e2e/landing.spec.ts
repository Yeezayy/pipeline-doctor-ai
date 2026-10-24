import { expect, test } from "@playwright/test";

test("public landing previews the product and opens the explicit demo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your pipeline failed.",
  );
  await expect(
    page.getByText("PRODUCT CAPTURES · SIMULATED DATA"),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Actual demo interface/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pipeline overview" }).click();
  await expect(
    page.getByRole("img", { name: /Actual demo dashboard/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explore the demo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Less firefighting. More shipping." }),
  ).toBeVisible();
});

test("landing has working mobile navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/#workflow$/);
  await expect(
    page.getByRole("heading", { name: /From “why is it red/ }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("OAuth visitors can reach the public landing but private pages require login", async ({
  page,
}) => {
  let privateRequests = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings")
      return route.fulfill({
        json: {
          auth_mode: "gitlab",
          demo_mode: false,
          oauth_configured: true,
          gitlab_url: "https://gitlab.com",
        },
      });
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          mode: "gitlab",
          authenticated: false,
          user: null,
          csrf_token: null,
        },
      });
    if (path === "/api/auth/gitlab/start")
      return route.fulfill({
        json: {
          authorization_url: "https://gitlab.com/oauth/authorize?fixture=1",
        },
      });
    privateRequests++;
    return route.fulfill({ status: 401, json: { detail: "Sign in" } });
  });
  await page.route("https://gitlab.com/oauth/authorize?fixture=1", (route) =>
    route.fulfill({ body: "GitLab authorization fixture" }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your pipeline failed.",
  );
  await page
    .getByRole("link", { name: "Connect your GitLab", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Connect your GitLab account." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue with GitLab" }).click();
  await expect(page).toHaveURL("https://gitlab.com/oauth/authorize?fixture=1");
  expect(privateRequests).toBe(0);
});

test("OAuth logout sends CSRF protection and clears the private workbench", async ({
  page,
}) => {
  let authenticated = true;
  let loggedOut = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings")
      return route.fulfill({
        json: {
          auth_mode: "gitlab",
          demo_mode: false,
          oauth_configured: true,
          gitlab_url: "https://gitlab.com",
          log_max_chars: 16000,
        },
      });
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          mode: "gitlab",
          authenticated,
          user: authenticated ? { username: "alice", name: "Alice" } : null,
          csrf_token: authenticated ? "fixture-csrf" : null,
        },
      });
    if (path === "/api/auth/logout") {
      expect(route.request().headers()["x-csrf-token"]).toBe("fixture-csrf");
      authenticated = false;
      loggedOut = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Connected as @alice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Disconnect GitLab" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your GitLab account." }),
  ).toBeVisible();
  await expect(page.getByText("Connected as @alice")).toHaveCount(0);
  expect(loggedOut).toBe(true);
});

test("expired OAuth credentials return the visitor to login rather than shared data", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings")
      return route.fulfill({
        json: {
          auth_mode: "gitlab",
          demo_mode: false,
          oauth_configured: true,
          gitlab_url: "https://gitlab.com",
        },
      });
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          mode: "gitlab",
          authenticated: true,
          user: { username: "alice", name: "Alice" },
          csrf_token: "fixture-csrf",
        },
      });
    return route.fulfill({
      status: 401,
      json: { detail: "Session expired; reconnect GitLab" },
    });
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Connect your GitLab account." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Less firefighting. More shipping." }),
  ).toHaveCount(0);
});
