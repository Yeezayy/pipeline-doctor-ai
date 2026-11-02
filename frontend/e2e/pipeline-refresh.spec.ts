import { expect, test, type Page } from "@playwright/test";
import type { Pipeline, Project, Settings } from "../src/types";

const projects: Project[] = [
  {
    id: "project-a",
    gitlab_id: 1,
    name: "team/first",
    web_url: "https://gitlab.example/team/first",
    source: "live",
  },
  {
    id: "project-b",
    gitlab_id: 2,
    name: "team/second",
    web_url: "https://gitlab.example/team/second",
    source: "live",
  },
];
function pipeline(id: number, status = "failed", ref = "main"): Pipeline {
  return {
    id,
    status,
    ref,
    sha: "immutable-commit",
    web_url: "",
    created_at: "2026-11-02T10:00:00Z",
  };
}

async function mockWorkspace(page: Page) {
  const state = {
    finished: false,
    traceFailure: false,
    traceCalls: 0,
    listRequests: [] as string[],
  };
  const settings: Settings = {
    demo_mode: false,
    gitlab_url: "https://gitlab.example/",
    gitlab_configured: true,
    auth_mode: "local",
    oauth_configured: false,
    oauth_callback_url: "",
    llm_configured: false,
    llm_model: "fixture",
    retention_days: 30,
    log_max_chars: 16000,
    auth_enabled: false,
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/settings") await route.fulfill({ json: settings });
    else if (path === "/api/auth/me")
      await route.fulfill({
        json: {
          mode: "local",
          authenticated: false,
          user: null,
          csrf_token: null,
        },
      });
    else if (path === "/api/projects") await route.fulfill({ json: projects });
    else if (path === "/api/projects/project-a/pipelines") {
      state.listRequests.push(path + url.search);
      await route.fulfill({
        json:
          url.searchParams.get("page") === "2"
            ? [pipeline(123, "failed", "legacy")]
            : Array.from({ length: 30 }, (_, i) => pipeline(200 + i)),
      });
    } else if (path === "/api/projects/project-b/pipelines") {
      state.listRequests.push(path + url.search);
      await route.fulfill({
        json:
          url.searchParams.get("page") === "1"
            ? [pipeline(999, "success", "fresh")]
            : [],
      });
    } else if (path === "/api/projects/project-a/pipelines/123") {
      await route.fulfill({
        json: {
          pipeline: pipeline(123, state.finished ? "failed" : "running"),
          jobs: [
            {
              id: 9,
              name: "build",
              stage: "build",
              status: state.finished ? "failed" : "running",
              duration: state.finished ? 15 : null,
            },
          ],
        },
      });
    } else if (path.endsWith("/jobs/9/trace")) {
      state.traceCalls++;
      await route.fulfill(
        state.traceFailure
          ? { status: 502, json: { detail: "GitLab trace unavailable" } }
          : {
              json: {
                text: state.finished
                  ? "ERROR: build failed"
                  : "Build is running",
                truncated: false,
                redacted: true,
                source: "live",
              },
            },
      );
    } else throw new Error(`Unexpected request: ${path}`);
  });
  return state;
}

test("changing project resets pagination, status filter and search before fetching", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  await page.goto("/pipelines");
  await expect(
    page.getByRole("link", { name: "#200", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 · 1 runs")).toBeVisible();
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search pipelines" })
    .fill("legacy");
  await expect(
    page.getByRole("link", { name: "#123", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Current project").selectOption("project-b");
  await expect(
    page.getByRole("link", { name: "#999", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search pipelines" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "All pipelines", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Page 1 · 1 runs")).toBeVisible();
  expect(state.listRequests.filter((url) => url.includes("project-b"))).toEqual(
    ["/api/projects/project-b/pipelines?page=1"],
  );
});

test("refresh pipeline updates status, jobs and logs for the same job", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  await page.goto("/pipelines/project-a/123");
  await expect(page.locator(".log-view")).toContainText("Build is running");
  await expect(
    page.getByRole("button", { name: "Diagnose this job" }),
  ).toBeDisabled();
  state.finished = true;
  await page
    .getByRole("button", { name: "Refresh pipeline", exact: true })
    .click();
  await expect(page.locator(".pipeline-detail-actions .status")).toContainText(
    "failed",
  );
  await expect(page.locator(".job-option .status")).toContainText("failed");
  await expect(page.locator(".log-view")).toContainText("ERROR: build failed");
  await expect(
    page.getByRole("button", { name: "Diagnose this job" }),
  ).toBeEnabled();
  expect(state.traceCalls).toBe(2);
});

test("failed initial log request can be retried without an empty-trace message", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  state.traceFailure = true;
  await page.goto("/pipelines/project-a/123");
  await expect(page.getByRole("alert")).toContainText(
    "GitLab trace unavailable",
  );
  await expect(
    page.getByText("No trace available.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy logs", exact: true }),
  ).toBeDisabled();
  state.traceFailure = false;
  await page.getByRole("button", { name: "Retry logs", exact: true }).click();
  await expect(page.locator(".log-view")).toContainText("Build is running");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy logs", exact: true }),
  ).toBeEnabled();
});

test("failed refresh labels cached logs and a retry replaces them", async ({
  page,
}) => {
  const state = await mockWorkspace(page);
  await page.goto("/pipelines/project-a/123");
  await expect(page.locator(".log-view")).toContainText("Build is running");
  state.traceFailure = true;
  await page.getByRole("button", { name: "Refresh logs", exact: true }).click();
  await expect(
    page.getByText("Refresh failed. Showing the last loaded log excerpt."),
  ).toBeVisible();
  await expect(page.locator(".log-view")).toContainText("Build is running");
  state.traceFailure = false;
  state.finished = true;
  await page.getByRole("button", { name: "Retry logs", exact: true }).click();
  await expect(page.locator(".log-view")).toContainText("ERROR: build failed");
  await expect(
    page.getByText("Refresh failed. Showing the last loaded log excerpt."),
  ).toHaveCount(0);
});
