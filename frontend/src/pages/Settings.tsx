import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Database,
  FlaskConical,
  GitBranch,
  KeyRound,
  Plug,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/button";
import { ErrorState, Loading, PageHeading } from "../components/common";
import { GitLabAccount } from "../components/GitLabAccount";
import { LOCAL_SETUP_URL, PUBLIC_DEMO } from "../lib/deployment";

export function Settings() {
  return PUBLIC_DEMO ? <PublicDemoSettings /> : <IntegrationSettings />;
}

function PublicDemoSettings() {
  return (
    <>
      <PageHeading
        eyebrow="PUBLIC PRESENTATION"
        title="A demo here. Your pipelines at home."
        description="This website runs entirely in your browser. It cannot connect to GitLab or call an AI provider."
      />
      <section className="panel settings-card">
        <div className="settings-title">
          <FlaskConical size={22} />
          <div>
            <h2>Simulated workspace</h2>
            <p>
              Six curated incidents, example diagnoses and fixed assistant
              replies.
            </p>
          </div>
        </div>
        <div className="configuration-note">
          <ShieldCheck size={18} />
          <p>
            No backend, account login or provider keys are used here. Example
            analyses and conversations live only in this tab’s memory and
            disappear when you reload. Do not enter credentials or private logs.
          </p>
        </div>
        <Button asChild>
          <a href={LOCAL_SETUP_URL} target="_blank" rel="noreferrer">
            Run the real application locally
          </a>
        </Button>
        <p className="panel-note">
          Real GitLab access, tokens, logs and saved diagnoses belong to your
          own local installation, not this presentation website.
        </p>
      </section>
    </>
  );
}

function IntegrationSettings() {
  const { settings, error, selectProject } = useWorkspace();
  const client = useQueryClient();
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const available = useQuery({
    queryKey: ["available", searchQuery, page],
    queryFn: () => api.available(searchQuery, page),
    enabled: !!settings,
  });
  const connection = useMutation({ mutationFn: api.connection });
  const connect = useMutation({
    mutationFn: api.connect,
    onSuccess: (p) => {
      selectProject(p.id);
      client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE SETTINGS"
        title="Connected, on your terms."
        description="Credentials stay on your server. Your workbench stays under your control."
      />
      <ErrorState error={error} />
      <div className="settings-grid">
        {settings?.auth_mode === "gitlab" ? (
          <GitLabAccount />
        ) : (
          <section className="panel settings-card">
            <div className="settings-title">
              <span className="settings-icon">
                <GitBranch size={21} />
              </span>
              <div>
                <h2>GitLab integration</h2>
                <p>Projects, pipelines and job traces.</p>
              </div>
              <span className="context-tag">
                {settings?.demo_mode
                  ? "Simulated"
                  : settings?.gitlab_configured
                    ? "Configured"
                    : "Not configured"}
              </span>
            </div>
            <dl>
              <dt>Instance URL</dt>
              <dd>{settings?.gitlab_url || "Unavailable"}</dd>
              <dt>Server credential</dt>
              <dd>
                {settings?.gitlab_configured
                  ? "Configured · hidden"
                  : "Not set"}
              </dd>
              <dt>Current mode</dt>
              <dd>
                {settings?.demo_mode ? "Demo · fixtures only" : "Live API"}
              </dd>
            </dl>
            <div className="configuration-note">
              <ShieldCheck size={16} />
              <p>
                Personal account login requires <code>AUTH_MODE=gitlab</code>, a
                registered OAuth application and <code>DEMO_MODE=false</code>.
                See the README for setup. The shared <code>GITLAB_TOKEN</code>{" "}
                remains a local-only fallback.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => connection.mutate()}
              disabled={connection.isPending}
            >
              <Plug size={14} />
              {connection.isPending ? "Checking…" : "Test connection"}
            </Button>
            {connection.data && (
              <p className="success-message">
                <Check size={14} />
                {connection.data.message}
              </p>
            )}
            <ErrorState error={connection.error} />
          </section>
        )}
        <section className="panel settings-card">
          <div className="settings-title">
            <span className="settings-icon violet">
              <Sparkles size={21} />
            </span>
            <div>
              <h2>Intelligence engine</h2>
              <p>LangChain · OpenAI-compatible provider.</p>
            </div>
          </div>
          <dl>
            <dt>Model</dt>
            <dd>{settings?.llm_model || "Unavailable"}</dd>
            <dt>API credential</dt>
            <dd>
              {settings?.llm_configured ? "Configured · hidden" : "Not set"}
            </dd>
            <dt>Log budget</dt>
            <dd>
              {settings?.log_max_chars.toLocaleString() || "—"} characters /
              diagnosis
            </dd>
          </dl>
          <div className="configuration-note">
            <Sparkles size={16} />
            <p>
              Configure <code>LLM_API_KEY</code>, <code>LLM_MODEL</code> and
              optionally <code>LLM_BASE_URL</code> on the server. The provider
              must support structured JSON output.
            </p>
          </div>
          {settings?.demo_mode && (
            <div className="demo-note">
              <FlaskConical size={15} />
              Demo mode uses curated diagnoses, not an LLM.
            </div>
          )}
        </section>
        <section className="panel settings-card project-settings">
          <div className="settings-title">
            <span className="settings-icon">
              <Plug size={21} />
            </span>
            <div>
              <h2>Connect a project</h2>
              <p>
                {settings?.auth_mode === "gitlab"
                  ? "Projects accessible with your connected GitLab account."
                  : "Projects accessible with your server-side GitLab token."}
              </p>
            </div>
          </div>
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearchQuery(search);
            }}
          >
            <Search size={15} />
            <label htmlFor="project-search" className="sr-only">
              Search projects
            </label>
            <input
              id="project-search"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline" size="sm" type="submit">
              Search
            </Button>
          </form>
          <ErrorState error={available.error || connect.error} />
          {available.isLoading ? (
            <Loading />
          ) : available.data?.length ? (
            <div className="available-projects">
              {available.data.map((p) => (
                <div key={p.id}>
                  <span className="project-avatar">{p.name[0]}</span>
                  <div>
                    <strong>{p.path_with_namespace}</strong>
                    <small>Project #{p.id}</small>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={connect.isPending}
                    onClick={() => connect.mutate(p.id)}
                  >
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              No projects found. Verify membership and token permissions.
            </p>
          )}
          {connect.isSuccess && (
            <p className="success-message">
              <Check size={14} />
              Project connected. Open Overview to inspect its pipelines.
            </p>
          )}
          <div className="pagination">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="muted small">Page {page}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={(available.data?.length || 0) < 50}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </section>
        <div className="settings-stack">
          {settings?.auth_mode !== "gitlab" && (
            <section className="panel settings-card">
              <div className="settings-title">
                <KeyRound size={18} />
                <div>
                  <h2>Local API access</h2>
                  <p>Optional APP_API_KEY, not your GitLab token.</p>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sessionStorage.setItem("doctor-api-key", key);
                  client.resetQueries();
                  setSaved(true);
                }}
              >
                <label htmlFor="api-key">Application API key</label>
                <input
                  id="api-key"
                  type="password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setSaved(false);
                  }}
                  autoComplete="off"
                  placeholder="Enter only if server requires it"
                />
                <Button size="sm" variant="outline" type="submit">
                  Save for this tab
                </Button>
                {saved && <span className="success-message">Saved</span>}
              </form>
              <p className="panel-note">
                Stored in sessionStorage for this tab. Never enter GitLab or LLM
                credentials here.
              </p>
            </section>
          )}
          <section className="panel settings-card retention-card">
            <Database size={18} />
            <h2>Small data footprint.</h2>
            <p>
              Diagnoses and conversations expire after{" "}
              {settings?.retention_days || 30} days. Raw traces are never
              stored. Delete any saved analysis from History.
            </p>
            <span className="secure-label">
              <ShieldCheck size={13} />
              Sanitized before AI and storage
            </span>
          </section>
        </div>
      </div>
    </>
  );
}
