import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/button";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  PipelineTable,
  Status,
} from "../components/common";

export function Pipelines() {
  const { project, loading, error } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["pipelines", project?.id, page],
    queryFn: () => api.pipelines(project!.id, page),
    enabled: !!project,
  });
  const term = search.trim().toLowerCase();
  const visiblePipelines = (query.data || []).filter((pipeline) => {
    const matchesStatus = filter === "all" || pipeline.status === filter;
    const matchesSearch =
      !term ||
      [pipeline.ref, pipeline.sha, `#${pipeline.id}`].some((value) =>
        value.toLowerCase().includes(term),
      );
    return matchesStatus && matchesSearch;
  });
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeading
        eyebrow="GITLAB / PIPELINES"
        title="Follow the signal."
        description="Every run, every branch. Start with the ones that need you."
        action={
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            disabled={!project || query.isFetching}
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        }
      />
      <ErrorState error={query.error} />
      {!project ? (
        <Empty
          title="Connect your first project"
          description="Choose a GitLab project in Settings."
          action={<Link to="/settings">Open Settings →</Link>}
        />
      ) : (
        <section className="panel">
          <div className="filter-bar">
            <div className="tabs">
              {["all", "failed", "success", "running"].map((f) => (
                <button
                  key={f}
                  className={filter === f ? "selected" : ""}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? "All pipelines"
                    : f === "success"
                      ? "Passed"
                      : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <span className="muted small">
              Page {page} · {query.data?.length || 0} runs
            </span>
          </div>
          <div className="pipeline-search">
            <div className="search-form">
              <Search size={15} aria-hidden="true" />
              <label htmlFor="pipeline-search" className="sr-only">
                Search pipelines
              </label>
              <input
                id="pipeline-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this page by branch, commit or pipeline ID…"
              />
              {search && (
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              )}
            </div>
            <span className="muted small" role="status">
              {visiblePipelines.length} matching runs on this page
            </span>
          </div>
          {query.isLoading ? (
            <Loading />
          ) : visiblePipelines.length ? (
            <PipelineTable
              pipelines={visiblePipelines}
              projectId={project.id}
            />
          ) : (
            <Empty
              title="No pipelines in this view"
              description="Try a different search, status or page. Search only covers the current fetched page."
            />
          )}
          <div className="pagination">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ArrowLeft size={13} />
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={(query.data?.length || 0) < 30}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ArrowRight size={13} />
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

export function PipelineDetail() {
  const { projectId = "", pipelineId = "" } = useParams();
  const id = Number(pipelineId);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [context, setContext] = useState("");
  const query = useQuery({
    queryKey: ["pipeline", projectId, id],
    queryFn: () => api.detail(projectId, id),
  });
  const job =
    query.data?.jobs.find((j) => j.id === selectedJob) ||
    query.data?.jobs.find((j) => j.status === "failed") ||
    query.data?.jobs[0];
  const trace = useQuery({
    queryKey: ["trace", projectId, id, job?.id],
    queryFn: () => api.trace(projectId, id, job!.id),
    enabled: !!job,
  });
  const analysis = useMutation({
    mutationFn: () => api.analyze(projectId, id, job!.id, context),
    onSuccess: (a) => {
      client.invalidateQueries({ queryKey: ["analyses"] });
      client.setQueryData(["analysis", a.id], a);
      navigate(`/diagnosis/${a.id}`);
    },
  });
  const copyLogs = useMutation({
    mutationFn: async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        return text;
      } catch {
        throw new Error(
          "Could not access the clipboard. Select and copy the displayed log excerpt instead.",
        );
      }
    },
  });
  const copied = copyLogs.isSuccess && copyLogs.data === trace.data?.text;
  return (
    <>
      <Link className="back-link" to="/pipelines">
        <ArrowLeft size={14} />
        All pipelines
      </Link>
      <PageHeading
        eyebrow={`PIPELINE #${id}`}
        title={query.data?.pipeline.ref || "Pipeline details"}
        description="Inspect the job output before asking AI for a diagnosis."
        action={query.data && <Status status={query.data.pipeline.status} />}
      />
      <ErrorState error={query.error} />
      {query.isLoading ? (
        <Loading />
      ) : (
        query.data && (
          <div className="detail-grid">
            <section className="panel jobs-panel">
              <div className="panel-heading">
                <h2>Jobs</h2>
                <span className="count">{query.data.jobs.length}</span>
              </div>
              {query.data.jobs.length ? (
                query.data.jobs.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJob(j.id)}
                    className={`job-option ${job?.id === j.id ? "selected" : ""}`}
                  >
                    <Terminal size={16} />
                    <div>
                      <strong>{j.name}</strong>
                      <small>
                        {j.stage} ·{" "}
                        {j.duration == null
                          ? "Duration unavailable"
                          : `${Math.round(j.duration)}s`}
                      </small>
                    </div>
                    <Status status={j.status} />
                  </button>
                ))
              ) : (
                <Empty
                  title="No jobs available"
                  description="This pipeline may have failed before jobs were created. Inspect its configuration in GitLab."
                />
              )}
            </section>
            <div className="job-main">
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    <Terminal size={15} />
                    {job?.name || "Job output"}
                  </h2>
                  <div className="log-actions">
                    <span className="secure-label">
                      <ShieldCheck size={13} />
                      Secrets masked
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={
                        !trace.data?.text ||
                        trace.isFetching ||
                        !!trace.error ||
                        copyLogs.isPending
                      }
                      onClick={() => {
                        if (trace.data?.text) copyLogs.mutate(trace.data.text);
                      }}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      <span aria-live="polite">
                        {copied ? "Logs copied" : "Copy logs"}
                      </span>
                    </Button>
                  </div>
                </div>
                <ErrorState error={trace.error} />
                <ErrorState error={copyLogs.error} />
                {trace.isLoading ? (
                  <Loading text="Fetching sanitized job trace…" />
                ) : (
                  <pre className="log-view">
                    {trace.data?.text || "No trace available."}
                  </pre>
                )}
                {trace.data?.truncated && (
                  <p className="panel-note">
                    Excerpt only. The middle of this trace has been omitted.
                  </p>
                )}
              </section>
              <section className="panel analyze-panel">
                <div>
                  <span className="eyebrow">A SECOND PAIR OF EYES</span>
                  <h2>Turn this failure into a next step.</h2>
                  <p>
                    Add optional context. Never include passwords or
                    credentials.
                  </p>
                </div>
                <label htmlFor="context" className="sr-only">
                  Additional context
                </label>
                <textarea
                  id="context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  maxLength={4000}
                  placeholder="e.g. This started after changing the Docker build context…"
                  rows={3}
                />
                <ErrorState error={analysis.error} />
                <div className="analyze-footer">
                  <span>
                    <ShieldCheck size={13} />
                    Read-only analysis. No changes applied.
                  </span>
                  <Button
                    onClick={() => analysis.mutate()}
                    disabled={
                      !job || job.status !== "failed" || analysis.isPending
                    }
                  >
                    {analysis.isPending ? (
                      <RefreshCw size={15} className="spin" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    {analysis.isPending
                      ? "Investigating…"
                      : "Diagnose this job"}
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </section>
            </div>
          </div>
        )
      )}
    </>
  );
}
