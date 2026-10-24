import type {
  Analysis,
  AvailableProject,
  Job,
  Pipeline,
  Project,
  Settings,
} from "../types";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const key = sessionStorage.getItem("doctor-api-key");
  const response = await fetch("/api" + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
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
