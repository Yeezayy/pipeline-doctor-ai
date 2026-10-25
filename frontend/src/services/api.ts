import type {
  Analysis,
  AuthSession,
  AvailableProject,
  Job,
  LogoutResult,
  Pipeline,
  Project,
  Settings,
} from "../types";
import { PUBLIC_DEMO } from "../lib/deployment";
import { demoApi } from "./publicDemo";

let csrfToken: string | null = null;
let oauthSession = false;

async function requestResponse(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const key = sessionStorage.getItem("doctor-api-key");
  const response = await fetch("/api" + path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && oauthSession) {
      csrfToken = null;
      window.dispatchEvent(new Event("doctor:session-expired"));
    }
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Request failed (${response.status})`,
    );
  }
  return response;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await requestResponse(path, init);
  return response.status === 204 ? (undefined as T) : response.json();
}
const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) });

const liveApi = {
  me: async () => {
    const session = await request<AuthSession>("/auth/me");
    csrfToken = session.csrf_token;
    oauthSession = session.mode === "gitlab";
    return session;
  },
  login: () => post<{ authorization_url: string }>("/auth/gitlab/start", {}),
  logout: async (): Promise<LogoutResult> => {
    const response = await requestResponse("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return {
      // Missing/unknown headers (including older backends) must not claim revocation.
      revocation:
        response.headers.get("X-GitLab-Revocation") === "revoked"
          ? "confirmed"
          : "unconfirmed",
    };
  },
  settings: () => request<Settings>("/settings"),
  projects: () => request<Project[]>("/projects"),
  available: (search: string, page = 1) =>
    request<AvailableProject[]>(
      `/projects/available?search=${encodeURIComponent(search)}&page=${page}`,
    ),
  connect: (gitlab_id: number) => post<Project>("/projects", { gitlab_id }),
  pipelines: (id: string, page = 1) =>
    request<Pipeline[]>(`/projects/${id}/pipelines?page=${page}`),
  detail: (id: string, pipeline: number) =>
    request<{ pipeline: Pipeline; jobs: Job[] }>(
      `/projects/${id}/pipelines/${pipeline}`,
    ),
  trace: (id: string, pipeline: number, job: number) =>
    request<{ text: string; truncated: boolean; source: string }>(
      `/projects/${id}/pipelines/${pipeline}/jobs/${job}/trace`,
    ),
  analyze: (
    project_id: string,
    pipeline_id: number,
    job_id: number,
    context: string,
  ) =>
    post<Analysis>("/analyses", { project_id, pipeline_id, job_id, context }),
  history: () => request<Analysis[]>("/analyses"),
  analysis: (id: string) => request<Analysis>(`/analyses/${id}`),
  chat: (id: string, message: string) =>
    post<Analysis>(`/analyses/${id}/messages`, { message }),
  remove: (id: string) =>
    request<void>(`/analyses/${id}`, { method: "DELETE" }),
  connection: () =>
    request<{ connected: boolean; source: string; message: string }>(
      "/connection",
    ),
};

export const api = PUBLIC_DEMO ? demoApi : liveApi;
