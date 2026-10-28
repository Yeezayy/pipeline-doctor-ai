export interface Settings {
  demo_mode: boolean;
  gitlab_url: string;
  gitlab_configured: boolean;
  llm_configured: boolean;
  llm_model: string;
  retention_days: number;
  log_max_chars: number;
  auth_enabled: boolean;
  auth_mode: "local" | "gitlab";
  oauth_configured: boolean;
  oauth_callback_url: string;
}
export interface AuthSession {
  mode: "local" | "gitlab";
  authenticated: boolean;
  user: { username: string; name: string } | null;
  csrf_token: string | null;
}
export interface LogoutResult {
  revocation: "confirmed" | "unconfirmed";
}
export interface Project {
  id: string;
  gitlab_id: number;
  name: string;
  web_url: string;
  source: string;
}
export interface AvailableProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
}
export interface Pipeline {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
}
export interface Job {
  id: number;
  name: string;
  stage: string;
  status: string;
  duration: number | null;
}
export interface ResolvedPipeline {
  project: Project;
  pipeline: Pipeline;
  jobs: Job[];
}
export interface CIConfig {
  path: string;
  commit_sha: string;
  text: string | null;
  truncated: boolean;
  source: string;
  web_url: string | null;
}
export interface Diagnosis {
  summary: string;
  root_cause: string;
  severity: string;
  confidence: number;
  evidence: string[];
  hypotheses: string[];
  suggested_fixes: string[];
  explanation: string;
  fixes_tested: false;
}
export interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}
export interface Analysis {
  id: string;
  project_id: string;
  pipeline_id: number;
  job_id: number;
  job_name: string;
  source: string;
  diagnosis: Diagnosis;
  pipeline: Pipeline;
  created_at: string;
  messages: Message[];
}
