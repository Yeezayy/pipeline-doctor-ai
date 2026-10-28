import { expect, test, type Page } from "@playwright/test";
import type { Project, ResolvedPipeline, Settings } from "../src/types";

const pipelineURL = "https://gitlab.example/team/subgroup/app/-/pipelines/123";
const project: Project = {
  id: "private-7",
  gitlab_id: 7,
  name: "team/subgroup/app",
  web_url: "https://gitlab.example/team/subgroup/app",
  source: "live",
};
const result: ResolvedPipeline = {
  project,
  pipeline: {
    id: 123,
    status: "failed",
    ref: "feature/example",
    sha: "immutable-commit",
    web_url: pipelineURL,
    created_at: "2026-10-28T10:00:00Z",
  },
  jobs: [
    { id: 9, name: "build", stage: "build", status: "failed", duration: 12 },
  ],
};

async function mockWorkspace(
  page: Page,
  existingProject = false,
  demo = false,
) {
  let projects: Project[] = existingProject
    ? [{ ...project, id: "other-project", name: "team/other" }]
    : [];
  const settings: Settings = {
    demo_mode: demo,
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
          authenticated: true,
          user: { username: "alice", name: "Alice" },
          csrf_token: "fixture-csrf",
        },
      });
    } else if (path === "/api/projects") {
      await route.fulfill({ json: projects });
    } else if (path === "/api/pipelines/resolve") {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers()["x-csrf-token"]).toBe("fixture-csrf");
      expect(route.request().postDataJSON()).toEqual({ url: pipelineURL });
      projects = [...projects, project];
      await route.fulfill({ json: result });
    } else if (path.endsWith("/pipelines/123/jobs/9/trace")) {
      await route.fulfill({
        json: {
          text: "error: build failed at immutable-commit",
          truncated: false,
          redacted: true,
          source: "live",
        },
      });
    } else if (path.endsWith("/pipelines/123")) {
      await route.fulfill({ json: result });
    } else if (path.endsWith("/pipelines")) {
      await route.fulfill({ json: [] });
    } else {
      throw new Error(`Unexpected pipeline URL request: ${path}`);
    }
  });
}

for (const existingProject of [false, true]) {
  test(`pipeline URL opens the run and selects its project (existing project: ${existingProject})`, async ({
    page,
  }) => {
    await mockWorkspace(page, existingProject);
    await page.goto("/pipelines");
    await page.getByLabel("GitLab pipeline URL").fill(pipelineURL);
    await page
      .getByRole("button", { name: "Open pipeline", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pipelines\/private-7\/123$/);
    await expect(
      page.getByRole("heading", { name: "feature/example" }),
    ).toBeVisible();
    await expect(page.getByLabel("Current project")).toHaveValue(project.id);
    await expect(page.locator(".log-view")).toContainText("build failed");
    await expect(
      page.getByRole("button", { name: "Diagnose this job" }),
    ).toBeEnabled();
    await page.reload();
    await expect(page.locator(".log-view")).toContainText("build failed");
    await expect(page.getByLabel("Current project")).toHaveValue(project.id);
  });
}

test("an inaccessible pipeline keeps the workspace and allows another URL", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/api/pipelines/resolve", (route) =>
    route.fulfill({
      status: 404,
      json: { detail: "GitLab resource not found or inaccessible" },
    }),
  );
  await page.goto("/pipelines");
  await page.getByLabel("GitLab pipeline URL").fill(pipelineURL);
  await page
    .getByRole("button", { name: "Open pipeline", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "not found or inaccessible",
  );
  await expect(page).toHaveURL(/\/pipelines$/);
  await expect(page.getByLabel("Current project")).toHaveValue("");
  await page.getByLabel("GitLab pipeline URL").fill(pipelineURL + "4");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open pipeline", exact: true }),
  ).toBeEnabled();
});

test("pipeline URL form fits mobile and is unavailable in the demo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto("/pipelines");
  await expect(page.getByLabel("GitLab pipeline URL")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await mockWorkspace(page, false, true);
  await page.reload();
  await expect(page.getByLabel("GitLab pipeline URL")).toHaveCount(0);
});
