import { expect, test, type Page } from "@playwright/test";
import type { Settings } from "../src/types";

const warningKey = "doctor-gitlab-revocation-pending";

async function mockGitLab(page: Page, revocation?: string) {
  let authenticated = true;
  const settings: Settings = {
    demo_mode: false,
    gitlab_url: "https://gitlab.example/",
    gitlab_configured: true,
    auth_mode: "gitlab",
    oauth_configured: true,
    oauth_callback_url: "http://localhost:8080/api/auth/gitlab/callback",
    llm_configured: false,
    llm_model: "fixture-model",
    retention_days: 30,
    log_max_chars: 16000,
    auth_enabled: false,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings") {
      await route.fulfill({ json: settings });
    } else if (path === "/api/auth/me") {
      await route.fulfill({
        json: {
          mode: "gitlab",
          authenticated,
          user: authenticated ? { username: "alice", name: "Alice" } : null,
          csrf_token: authenticated ? "fixture-csrf" : null,
        },
      });
    } else if (path === "/api/auth/logout") {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers()["x-csrf-token"]).toBe("fixture-csrf");
      authenticated = false;
      await route.fulfill({
        status: 204,
        headers: revocation ? { "X-GitLab-Revocation": revocation } : {},
      });
    } else if (path === "/api/projects" || path === "/api/projects/available") {
      await route.fulfill({ json: [] });
    } else {
      throw new Error(`Unexpected mocked auth request: ${path}`);
    }
  });
}

test("GitLab consent explains the API scope and project boundary", async ({
  page,
}) => {
  await mockGitLab(page, "revoked");
  await page.goto("/settings");
  await expect(page.getByText("Requested permission:")).toContainText(
    "read_api",
  );
  await expect(page.getByText("Requested permission:")).toContainText(
    "not just the projects you connect here",
  );
  await expect(page.getByText("Requested permission:")).toContainText(
    "Selecting a project does not restrict the GitLab token itself",
  );
});

for (const revocation of [
  "pending-manual-revocation",
  "not-attempted",
  "unknown",
  undefined,
]) {
  test(`logout persists a warning when revocation is ${revocation ?? "missing"}`, async ({
    page,
  }) => {
    await mockGitLab(page, revocation);
    await page.goto("/settings");
    await page.evaluate(() =>
      localStorage.setItem("doctor-project", "fixture-private-project"),
    );
    await page.getByRole("button", { name: "Disconnect GitLab" }).click();
    await expect(
      page.getByRole("heading", { name: "Connect your GitLab account." }),
    ).toBeVisible();
    const warning = page.getByRole("alert");
    await expect(warning).toContainText("GitLab revocation not confirmed");
    await expect(warning.getByRole("link")).toHaveAttribute(
      "href",
      "https://gitlab.example/-/user_settings/applications",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("doctor-project")),
    ).toBeNull();
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), warningKey),
    ).toBe("true");
    await page.reload();
    await expect(warning).toContainText("GitLab revocation not confirmed");
    await page
      .getByRole("button", {
        name: "I revoked access in GitLab",
      })
      .click();
    await expect(warning).toHaveCount(0);
    await page.reload();
    await expect(warning).toHaveCount(0);
  });
}

test("confirmed GitLab revocation closes the workspace without a warning", async ({
  page,
}) => {
  await mockGitLab(page, "revoked");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Disconnect GitLab" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your GitLab account." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), warningKey),
  ).toBeNull();
});

test("permissions and revocation warning remain readable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGitLab(page, "pending-manual-revocation");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Disconnect GitLab" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "GitLab revocation not confirmed",
  );
  await expect(
    page.getByRole("button", { name: "I revoked access in GitLab" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test("a previous unconfirmed revocation is not silently cleared by another logout", async ({
  page,
}) => {
  await mockGitLab(page, "revoked");
  await page.addInitScript(
    (key) => sessionStorage.setItem(key, "true"),
    warningKey,
  );
  await page.goto("/settings");
  await expect(page.getByRole("alert")).toContainText(
    "GitLab revocation not confirmed",
  );
  await page.getByRole("button", { name: "Disconnect GitLab" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your GitLab account." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "GitLab revocation not confirmed",
  );
});

test("a failed local logout does not claim the session was closed", async ({
  page,
}) => {
  await mockGitLab(page, "revoked");
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Local logout unavailable" },
    }),
  );
  await page.goto("/settings");
  await page.getByRole("button", { name: "Disconnect GitLab" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Local logout unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Connected as @alice" }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), warningKey),
  ).toBeNull();
});
