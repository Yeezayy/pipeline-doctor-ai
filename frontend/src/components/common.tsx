import {
  AlertCircle,
  Check,
  Circle,
  LoaderCircle,
  X,
  GitBranch,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { date } from "../lib/utils";
import type { Pipeline } from "../types";

export function Status({ status }: { status: string }) {
  const Icon =
    status === "success"
      ? Check
      : status === "failed"
        ? X
        : status === "running"
          ? LoaderCircle
          : Circle;
  return (
    <span className={`status status-${status}`}>
      <Icon size={12} />
      {status}
    </span>
  );
}
export function Loading({ text = "Loading workspace…" }: { text?: string }) {
  return (
    <div className="state">
      <LoaderCircle className="spin" size={22} />
      <span>{text}</span>
    </div>
  );
}
export function ErrorState({ error }: { error: Error | null }) {
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{error.message}</span>
    </div>
  ) : null;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="state empty">
      <Sparkles size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function PipelineTable({
  pipelines,
  projectId,
}: {
  pipelines: Pipeline[];
  projectId: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pipeline</th>
            <th>Status</th>
            <th>Branch / commit</th>
            <th>Started</th>
            <th>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pipelines.map((p) => (
            <tr key={p.id}>
              <td>
                <Link
                  className="pipeline-id"
                  to={`/pipelines/${projectId}/${p.id}`}
                >
                  <span className="tiny-dot" />#{p.id}
                </Link>
              </td>
              <td>
                <Status status={p.status} />
              </td>
              <td>
                <div className="branch">
                  <GitBranch size={13} />
                  {p.ref}
                </div>
                <code className="commit">{p.sha.slice(0, 8)}</code>
              </td>
              <td className="muted nowrap">{date(p.created_at)}</td>
              <td>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/pipelines/${projectId}/${p.id}`}>
                    Inspect <ArrowUpRight size={14} />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
