import type {
  Analysis,
  AuthSession,
  AvailableProject,
  Diagnosis,
  Job,
  LogoutResult,
  Pipeline,
  Project,
  ResolvedPipeline,
  Settings,
} from "../types";

// Presentation fixtures only. No requests, credentials or persistent user data.
const project: Project = {
  id: "demo-1",
  gitlab_id: 1,
  name: "acme / storefront",
  web_url: "",
  source: "demo",
};
const incidents = [
  {
    name: "docker-build",
    stage: "build",
    title: "Dockerfile not found",
    error:
      "failed to read dockerfile: open Dockerfile: no such file or directory",
    cause: "The build context does not contain the requested Dockerfile.",
    fix: "Verify the working directory, commit the Dockerfile, or pass docker build -f path/to/Dockerfile with the correct context.",
  },
  {
    name: "typescript-build",
    stage: "build",
    title: "TypeScript compilation failed",
    error:
      "src/main.ts(18,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    cause: "A TypeScript assignment violates the declared type.",
    fix: "Inspect src/main.ts:18 and align the value and declared type; run npm run build locally.",
  },
  {
    name: "unit-tests",
    stage: "test",
    title: "Missing Python dependency",
    error: "ModuleNotFoundError: No module named 'httpx'",
    cause: "The test environment does not have httpx installed.",
    fix: "Declare httpx in the dependency manifest and install dependencies before pytest.",
  },
  {
    name: "validate-ci",
    stage: "validate",
    title: "Invalid YAML configuration",
    error:
      ".gitlab-ci.yml: mapping values are not allowed in this context at line 12, column 9",
    cause: "The YAML parser rejected the CI configuration.",
    fix: "Inspect indentation and unquoted colons near line 12, then validate with GitLab CI Lint.",
  },
  {
    name: "registry-push",
    stage: "deploy",
    title: "Registry authentication failed",
    error: "unauthorized: authentication required",
    cause: "The registry rejected the push credentials or permissions.",
    fix: "Check registry login, protected CI variables and token scope; never print credentials in a job log.",
  },
  {
    name: "integration-tests",
    stage: "test",
    title: "Incompatible job image",
    error: "/bin/sh: python: not found",
    cause: "The job image does not provide Python on PATH.",
    fix: "Use a Python image such as python:3.12-slim or install Python explicitly.",
  },
];
const pipelines: Pipeline[] = Array.from({ length: 9 }, (_, i) => ({
  id: 1048 - i,
  status: i < 6 ? "failed" : "success",
  ref: ["main", "feat/checkout", "fix/dependencies"][i % 3],
  sha: [
    "601abc7e",
    "96da08f8",
    "0c809a5f",
    "bfcda5ab",
    "ff998cbd",
    "bb8ba5c3",
    "817f223a",
    "5d5f0ee1",
    "f7b16031",
  ][i].padEnd(40, "0"),
  web_url: "",
  created_at: new Date(
    Date.UTC(2026, 9, 24, 10, 30) - i * 3 * 3600000,
  ).toISOString(),
}));
let analyses: Analysis[] = [];
const clone = <T>(value: T): T => structuredClone(value);

function checkProject(id: string) {
  if (id !== project.id)
    throw new Error(
      "This public demo contains only the simulated storefront project.",
    );
}
function getPipeline(id: number): Pipeline {
  const result = pipelines.find((p) => p.id === id);
  if (!result) throw new Error("Simulated pipeline not found.");
  return result;
}
function jobs(id: number): Job[] {
  getPipeline(id);
  const incident = incidents[1048 - id];
  return [
    {
      id: id * 10,
      name: incident?.name || "build-and-test",
      stage: incident?.stage || "test",
      status: incident ? "failed" : "success",
      duration: 42 + (1048 - id) * 13,
    },
  ];
}
function getAnalysis(id: string) {
  const result = analyses.find((a) => a.id === id);
  if (!result)
    throw new Error(
      "This demo analysis is no longer in memory. Create another from Pipelines.",
    );
  return result;
}
function unavailable(): never {
  throw new Error(
    "Real GitLab connections are available only in the local application. This website is a simulated demo.",
  );
}
function mask(message: string) {
  return message
    .replace(
      /((?:token|password|secret|api[_-]?key)\s*[:=]\s*)\S+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b(?:glpat-|ghp_|sk-)[A-Za-z0-9_-]+/g, "[REDACTED]");
}

export const demoApi = {
  me: async (): Promise<AuthSession> => ({
    mode: "local",
    authenticated: false,
    user: null,
    csrf_token: null,
  }),
  login: async (): Promise<{ authorization_url: string }> => unavailable(),
  logout: async (): Promise<LogoutResult> => unavailable(),
  settings: async (): Promise<Settings> => ({
    demo_mode: true,
    gitlab_url: "https://gitlab.com",
    gitlab_configured: false,
    llm_configured: false,
    llm_model: "No model · fixed examples",
    retention_days: 0,
    log_max_chars: 16000,
    auth_enabled: false,
    auth_mode: "local",
    oauth_configured: false,
    oauth_callback_url: "",
  }),
  projects: async (): Promise<Project[]> => [clone(project)],
  available: async (search: string, page = 1): Promise<AvailableProject[]> =>
    page === 1 && "acme/storefront".includes(search.toLowerCase())
      ? [
          {
            id: 1,
            name: project.name,
            path_with_namespace: "acme/storefront",
            web_url: "",
          },
        ]
      : [],
  connect: async (_id: number): Promise<Project> => unavailable(),
  resolvePipeline: async (_url: string): Promise<ResolvedPipeline> =>
    unavailable(),
  pipelines: async (id: string, page = 1): Promise<Pipeline[]> => {
    checkProject(id);
    return page === 1 ? clone(pipelines) : [];
  },
  detail: async (id: string, pipeline: number) => {
    checkProject(id);
    return { pipeline: clone(getPipeline(pipeline)), jobs: jobs(pipeline) };
  },
  trace: async (id: string, pipeline: number, job: number) => {
    checkProject(id);
    const row = jobs(pipeline)[0];
    if (row.id !== job)
      throw new Error("Simulated job does not belong to this pipeline.");
    const incident = incidents[1048 - pipeline];
    return {
      text: `Running with gitlab-runner (SIMULATED PUBLIC DEMO)\nPreparing the docker executor\nFetching changes...\n$ running ${row.name}\n${incident?.error || "All checks passed."}\nCleaning up project directory\n${incident ? "ERROR: Job failed: exit code 1" : "Job succeeded"}`,
      truncated: false,
      source: "demo",
    };
  },
  analyze: async (
    id: string,
    pipeline: number,
    job: number,
    _context: string,
  ): Promise<Analysis> => {
    checkProject(id);
    const p = getPipeline(pipeline);
    const incident = incidents[1048 - pipeline];
    if (!incident || jobs(pipeline)[0].id !== job)
      throw new Error(
        "Select a failed simulated job to view its example diagnosis.",
      );
    const diagnosis: Diagnosis = {
      summary: incident.title,
      root_cause: incident.cause,
      severity: "medium",
      confidence: 0.9,
      evidence: [incident.error],
      hypotheses: [
        "Curated simulated example. No GitLab API or LLM has been called.",
      ],
      suggested_fixes: [
        incident.fix,
        "Review the change and rerun the affected job yourself to verify it.",
      ],
      explanation: `${incident.cause} The simulated trace contains: ${incident.error}. These recommendations have not been executed or tested.`,
      fixes_tested: false,
    };
    const result: Analysis = {
      id: crypto.randomUUID(),
      project_id: id,
      pipeline_id: pipeline,
      job_id: job,
      job_name: incident.name,
      source: "demo",
      diagnosis,
      pipeline: clone(p),
      created_at: new Date().toISOString(),
      messages: [],
    };
    analyses.unshift(result);
    analyses = analyses.slice(0, 30);
    return clone(result);
  },
  history: async (): Promise<Analysis[]> => clone(analyses),
  analysis: async (id: string): Promise<Analysis> => clone(getAnalysis(id)),
  chat: async (id: string, message: string): Promise<Analysis> => {
    const analysis = getAnalysis(id);
    if (!message.trim() || message.length > 4000)
      throw new Error("Enter a question of at most 4000 characters.");
    if (analysis.messages.length >= 100)
      throw new Error(
        "Demo conversation limit reached. Create a new example analysis.",
      );
    const now = new Date().toISOString();
    analysis.messages.push(
      {
        id: crypto.randomUUID(),
        role: "user",
        content: mask(message),
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `[Simulated assistant — no LLM call] ${analysis.diagnosis.root_cause}\n\nRecommended check: ${analysis.diagnosis.suggested_fixes[0]}\n\nThis is a fixed example, not a generated answer. No correction was tested.`,
        created_at: now,
      },
    );
    return clone(analysis);
  },
  remove: async (id: string): Promise<void> => {
    getAnalysis(id);
    analyses = analyses.filter((a) => a.id !== id);
  },
  connection: async () => ({
    connected: false,
    source: "demo",
    message: "Public demo only. Run the local application to connect GitLab.",
  }),
};
