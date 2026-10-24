import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  GitBranch,
  ScanLine,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/button";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  PipelineTable,
} from "../components/common";
import { date } from "../lib/utils";

export function Dashboard() {
  const { project, loading, error, settings } = useWorkspace();
  const pipelines = useQuery({
    queryKey: ["pipelines", project?.id, 1],
    queryFn: () => api.pipelines(project!.id),
    enabled: !!project,
  });
  const history = useQuery({ queryKey: ["analyses"], queryFn: api.history });
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!project)
    return (
      <Empty
        title="Your next green pipeline starts here."
        description="Connect a GitLab project in Settings to inspect its pipelines."
        action={
          <Button asChild>
            <Link to="/settings">
              Connect a project <ArrowRight size={15} />
            </Link>
          </Button>
        }
      />
    );
  const rows = pipelines.data || [];
  const failed = rows.filter((p) => p.status === "failed").length;
  const successful = rows.filter((p) => p.status === "success").length;
  const rate = rows.length ? Math.round((successful / rows.length) * 100) : 0;
  return (
    <>
      <PageHeading
        eyebrow="YOUR CI, AT A GLANCE"
        title="Less firefighting. More shipping."
        description="Understand what broke. Find the evidence. Get back to building."
        action={
          <Button asChild>
            <Link to="/pipelines">
              <ScanLine size={16} />
              Inspect pipelines <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <ErrorState error={pipelines.error || history.error} />
      <div className="stats-grid">
        {[
          {
            label: "Recent pipelines",
            value: rows.length,
            caption: "In the latest fetched page",
            icon: GitBranch,
            color: "violet",
          },
          {
            label: "Passed",
            value: successful,
            caption: "Ready for the next step",
            icon: CheckCheck,
            color: "green",
          },
          {
            label: "Need attention",
            value: failed,
            caption: "Failed pipelines to investigate",
            icon: XCircle,
            color: "red",
          },
          {
            label: "Pass rate",
            value: `${rate}%`,
            caption: "Within this pipeline sample",
            icon: ArrowUpRight,
            color: "cyan",
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">
              {stat.label}
              <stat.icon size={16} className={`text-${stat.color}`} />
            </div>
            <div className="stat-value">
              {pipelines.isLoading ? "—" : stat.value}
            </div>
            <div className="stat-caption">{stat.caption}</div>
          </div>
        ))}
      </div>
      <section className="insight-banner">
        <div className="insight-symbol">
          <Sparkles size={27} />
        </div>
        <div>
          <span className="eyebrow">FROM FAILURE TO A WAY FORWARD</span>
          <h2>Your logs have a story. Let’s decode it.</h2>
          <p>
            Evidence-backed diagnoses, actionable next steps, and an assistant
            that knows the context.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/pipelines">
            Find a failed job <ArrowRight size={15} />
          </Link>
        </Button>
        <div className="orb" />
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Recent pipelines <span className="count">{rows.length}</span>
            </h2>
            <Link className="text-link" to="/pipelines">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          {pipelines.isLoading ? (
            <Loading />
          ) : rows.length ? (
            <PipelineTable
              pipelines={rows.slice(0, 6)}
              projectId={project.id}
            />
          ) : (
            <Empty
              title="No pipelines yet"
              description="Push a commit in GitLab, then refresh this workspace."
            />
          )}
        </section>
        <div className="right-column">
          <section className="panel health-panel">
            <div className="panel-heading">
              <h2>Pipeline pulse</h2>
              <span className="eyebrow">LATEST {rows.length}</span>
            </div>
            <div
              className="pulse-bars"
              aria-label={`${successful} successful, ${failed} failed pipelines`}
            >
              {rows.map((p) => (
                <Link
                  key={p.id}
                  to={`/pipelines/${project.id}/${p.id}`}
                  title={`Pipeline #${p.id}: ${p.status}`}
                  className={`pulse-bar ${p.status}`}
                  style={{ height: `${44 + (p.id % 4) * 15}px` }}
                />
              ))}
            </div>
            <div className="pulse-legend">
              <span>
                <i className="legend-dot green" /> Passed
              </span>
              <span>
                <i className="legend-dot red" /> Failed
              </span>
            </div>
            <p className="panel-note">
              Status by pipeline, oldest to newest →<br />
              Bar height is decorative, not duration.
            </p>
          </section>
          <section className="panel recent-analyses">
            <div className="panel-heading">
              <h2>Latest diagnoses</h2>
              <Sparkles size={15} className="text-violet" />
            </div>
            {history.data?.length ? (
              history.data.slice(0, 3).map((a) => (
                <Link
                  className="analysis-mini"
                  to={`/diagnosis/${a.id}`}
                  key={a.id}
                >
                  <span className="analysis-mini-icon">
                    <ArrowDownRight size={15} />
                  </span>
                  <div>
                    <strong>{a.diagnosis.summary}</strong>
                    <small>
                      #{a.pipeline_id} · {date(a.created_at)}
                    </small>
                  </div>
                  <ArrowUpRight size={13} />
                </Link>
              ))
            ) : (
              <div className="small-empty">
                <ScanLine size={20} />
                <p>
                  No diagnoses yet.
                  <br />
                  <span>Inspect a failed job to create your first.</span>
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="section-footnote">
        <span className="live-dot" />
        {settings?.demo_mode
          ? "Simulated workspace · six reproducible failure scenarios"
          : "GitLab data · refreshed when you return to this window"}
      </div>
    </>
  );
}
