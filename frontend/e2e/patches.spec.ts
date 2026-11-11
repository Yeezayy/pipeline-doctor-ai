import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Analysis, FixPatch, Settings } from "../src/types";

const sha = "a".repeat(40);
const analysis: Analysis = {
  id: "analysis-1",
  project_id: "project-7",
  pipeline_id: 123,
  job_id: 9,
  job_name: "integration-tests",
  source: "live",
  created_at: "2026-11-11T12:00:00Z",
  messages: [],
  pipeline: {
    id: 123,
    status: "failed",
    ref: "main",
    sha,
    web_url: "",
    created_at: "2026-11-11T12:00:00Z",
  },
  diagnosis: {
    summary: "Python is missing from the job image",
    root_cause: "The job uses an Alpine image without Python.",
    severity: "medium",
    confidence: 0.9,
    evidence: ["python: not found"],
    hypotheses: [],
    suggested_fixes: ["Use a Python image."],
    explanation: "The selected job image does not provide Python.",
    fixes_tested: false,
  },
};
const patch: FixPatch = {
  analysis_id: analysis.id,
  base_sha: sha,
  path: ".gitlab-ci.yml",
  source: "live",
  status: "ready",
  summary: "Use a Python image",
  explanation: "Replace the incompatible job image.",
  diff: "--- a/.gitlab-ci.yml\n+++ b/.gitlab-ci.yml\n@@ -1 +1 @@\n-image: alpine:3.21\n+image: python:3.12-slim\n",
  applicability_checked: true,
  yaml_syntax_valid: true,
  fixes_tested: false,
  verification_steps: [
    "git apply --check --unidiff-zero pipeline-doctor-ci.patch",
    "Rerun the integration test job.",
  ],
  limitations: ["GitLab CI validation and jobs have not been run."],
};

async function workspace(page: Page) {
  const state = { response: patch, fail: false, calls: 0 };
  const settings: Settings = {
    demo_mode: false,
    gitlab_url: "https://gitlab.example/",
    gitlab_configured: true,
    auth_mode: "gitlab",
    oauth_configured: true,
    oauth_callback_url: "",
    llm_configured: true,
    llm_model: "fixture",
    retention_days: 30,
    log_max_chars: 16000,
    auth_enabled: false,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/settings") await route.fulfill({ json: settings });
    else if (path === "/api/auth/me")
      await route.fulfill({
        json: {
          mode: "gitlab",
          authenticated: true,
          user: { username: "alice", name: "Alice" },
          csrf_token: "fixture-csrf",
        },
      });
    else if (path === "/api/projects") await route.fulfill({ json: [] });
    else if (path === "/api/analyses/analysis-1")
      await route.fulfill({ json: analysis });
    else if (path === "/api/analyses/analysis-1/fixes") {
      state.calls++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers()["x-csrf-token"]).toBe("fixture-csrf");
      await route.fulfill(
        state.fail
          ? {
              status: 502,
              json: {
                detail: "The proposed patch could not be matched to the source",
              },
            }
          : { json: state.response },
      );
    } else throw new Error(`Unexpected request: ${path}`);
  });
  return state;
}

test("generate, inspect, copy and download a patch without applying it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await workspace(page);
  await page.goto("/diagnosis/analysis-1");
  await expect(
    page.getByRole("heading", { name: "Suggested CI patch" }),
  ).toBeVisible();
  expect(state.calls).toBe(0);
  await page
    .getByRole("button", { name: "Generate patch", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Use a Python image", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Proposed CI patch")).toContainText(
    "+image: python:3.12-slim",
  );
  await expect(
    page.getByText("Source match verified", { exact: false }),
  ).toContainText("YAML syntax valid");
  await expect(page.locator(".patch-base")).toContainText("Jobs not run");
  await page.getByRole("button", { name: "Copy patch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Patch copied" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    patch.diff,
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download patch", exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("pipeline-doctor-ci.patch");
  const target = test.info().outputPath("downloaded.patch");
  await download.saveAs(target);
  expect(await readFile(target, "utf8")).toBe(patch.diff);
  expect(state.calls).toBe(1);
  await page.screenshot({
    path: test.info().outputPath("patch-preview.png"),
    fullPage: true,
  });
});

test("missing context is explained without showing a fabricated diff", async ({
  page,
}) => {
  const state = await workspace(page);
  state.response = {
    ...patch,
    status: "needs_context",
    summary: "More context is needed",
    explanation: "The dependency manifest is required.",
    diff: null,
    applicability_checked: false,
    yaml_syntax_valid: null,
    verification_steps: [],
  };
  await page.goto("/diagnosis/analysis-1");
  await page
    .getByRole("button", { name: "Generate patch", exact: true })
    .click();
  await expect(
    page.getByText("The dependency manifest is required.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Proposed CI patch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy patch" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download patch" }),
  ).toHaveCount(0);
});

test("patch errors can be retried without losing the diagnosis", async ({
  page,
}) => {
  const state = await workspace(page);
  state.fail = true;
  await page.goto("/diagnosis/analysis-1");
  await page
    .getByRole("button", { name: "Generate patch", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be matched");
  await expect(
    page.getByRole("heading", { name: analysis.diagnosis.summary }),
  ).toBeVisible();
  state.fail = false;
  await page
    .getByRole("button", { name: "Generate patch", exact: true })
    .click();
  await expect(page.getByLabel("Proposed CI patch")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("patch preview fits mobile and explains clipboard failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("unavailable");
        },
      },
    });
  });
  await page.goto("/diagnosis/analysis-1");
  await page
    .getByRole("button", { name: "Generate patch", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy patch", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not access the clipboard",
  );
  await expect(
    page.getByRole("button", { name: "Download patch", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
