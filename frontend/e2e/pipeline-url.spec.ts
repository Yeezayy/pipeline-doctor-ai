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
  const ciRequests: string[] = [];
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
    } else if (path.endsWith("/pipelines/123/ci")) {
      ciRequests.push(path);
      await route.fulfill({
        json: {
          path: ".gitlab-ci.yml",
          commit_sha: "immutable-commit",
          source: "live",
          truncated: false,
          web_url: project.web_url + "/-/blob/immutable-commit/.gitlab-ci.yml",
          text: "include:\n  - local: .gitlab/ci/build.yml\nbuild:\n  script:\n    - echo '<img src=x onerror=alert(1)>'\n",
        },
      });
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
  return ciRequests;
}

test("pipeline tabs show highlighted YAML at the run commit and copy only source", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const requests = await mockWorkspace(page);
  await page.goto("/pipelines/private-7/123");
  await expect(page.locator(".log-view")).toContainText("build failed");
  expect(requests).toHaveLength(0);
  await expect(page.locator(".log-error")).toContainText("build failed");
  await page.getByRole("button", { name: "Copy logs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Logs copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await page.locator(".log-view").innerText(),
  );
  await page
    .getByRole("tab", { name: "CI configuration", exact: true })
    .click();
  const source = page.locator(".ci-source");
  await expect(source).toContainText("include:");
  await expect(source.locator(".hljs-attr").first()).toContainText("include");
  await expect(source.locator("img")).toHaveCount(0);
  await expect(page.locator(".ci-context")).toContainText("not expanded");
  await expect(
    page.getByRole("link", { name: "View in GitLab" }),
  ).toHaveAttribute("href", /immutable-commit\/\.gitlab-ci.yml$/);
  await page.getByRole("button", { name: "Copy YAML", exact: true }).click();
  await expect(page.getByRole("button", { name: "YAML copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await source.textContent(),
  );
  await page
    .getByRole("tab", { name: "CI configuration", exact: true })
    .press("Home");
  await expect(page.getByRole("tab", { name: "Job logs" })).toBeFocused();
  await expect(page.locator(".log-view")).toBeVisible();
  await page.getByRole("tab", { name: "Job logs" }).press("ArrowRight");
  await expect(source).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.screenshot({
    path: "/private/tmp/pipeline-doctor-ci-desktop.png",
    fullPage: true,
  });
});

for (const text of [null, ""]) {
  test(`unavailable or empty YAML preserves logs (${text === null ? "missing" : "empty"})`, async ({
    page,
  }) => {
    await mockWorkspace(page);
    await page.route("**/pipelines/123/ci", (route) =>
      route.fulfill({
        json: {
          path: ".gitlab-ci.yml",
          commit_sha: "immutable-commit",
          source: "live",
          truncated: false,
          web_url: null,
          text,
        },
      }),
    );
    await page.goto("/pipelines/private-7/123");
    await page
      .getByRole("tab", { name: "CI configuration", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name:
          text === null
            ? "CI configuration unavailable"
            : "Empty CI configuration",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy YAML" }),
    ).toBeDisabled();
    await page.getByRole("tab", { name: "Job logs" }).click();
    await expect(page.locator(".log-view")).toContainText("build failed");
  });
}

test("configuration errors can be retried without losing the pipeline", async ({
  page,
}) => {
  await mockWorkspace(page);
  let unavailable = true;
  await page.route("**/pipelines/123/ci", async (route) => {
    if (unavailable)
      await route.fulfill({
        status: 502,
        json: { detail: "GitLab unavailable" },
      });
    else await route.fallback();
  });
  await page.goto("/pipelines/private-7/123");
  await page
    .getByRole("tab", { name: "CI configuration", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("GitLab unavailable");
  await expect(
    page.getByRole("button", { name: "Retry configuration" }),
  ).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "Retry configuration" }).click();
  await expect(page.locator(".ci-source")).toContainText("build:");
});

test("clipboard failure keeps the selected job logs readable", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    });
  });
  await page.goto("/pipelines/private-7/123");
  await page.getByRole("button", { name: "Copy logs", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not access the clipboard",
  );
  await expect(page.locator(".log-view")).toContainText("build failed");
});

test("CI remains inspectable when no jobs exist and fits mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.route("**/pipelines/123", (route) =>
    route.fulfill({ json: { pipeline: result.pipeline, jobs: [] } }),
  );
  await page.goto("/pipelines/private-7/123");
  await expect(
    page.getByRole("heading", { name: "No jobs available" }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "CI configuration", exact: true })
    .click();
  await expect(page.locator(".ci-source")).toContainText("build:");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "/private/tmp/pipeline-doctor-ci-mobile.png",
    fullPage: true,
  });
});

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
