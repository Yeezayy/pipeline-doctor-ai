import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileCode2,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import { api } from "../services/api";
import { useWorkspace } from "../hooks/useWorkspace";
import { gitlabLink } from "../lib/utils";
import type { Job, Pipeline } from "../types";
import { Empty, ErrorState, Loading } from "./common";
import { Button } from "./ui/button";

hljs.registerLanguage("yaml", yaml);

export function PipelineEvidence({
  projectId,
  pipeline,
  job,
}: {
  projectId: string;
  pipeline: Pipeline;
  job?: Job;
}) {
  const { settings } = useWorkspace();
  const [tab, setTab] = useState<"logs" | "ci">("logs");
  const trace = useQuery({
    queryKey: ["trace", projectId, pipeline.id, job?.id],
    queryFn: () => api.trace(projectId, pipeline.id, job!.id),
    enabled: !!job,
  });
  const ci = useQuery({
    queryKey: ["ci", projectId, pipeline.id],
    queryFn: () => api.ci(projectId, pipeline.id),
    enabled: tab === "ci",
  });
  const copy = useMutation({
    mutationFn: async ({
      text,
      kind,
    }: {
      text: string;
      kind: "logs" | "ci";
    }) => {
      try {
        await navigator.clipboard.writeText(text);
        return { text, kind };
      } catch {
        throw new Error(
          "Could not access the clipboard. Select and copy the displayed excerpt instead.",
        );
      }
    },
  });
  const highlighted = useMemo(
    () =>
      hljs.highlight(ci.data?.text || "", {
        language: "yaml",
        ignoreIllegals: true,
      }).value,
    [ci.data?.text],
  );
  const fileURL = gitlabLink(ci.data?.web_url, settings?.gitlab_url);
  const copiedLogs =
    copy.isSuccess &&
    copy.data.kind === "logs" &&
    copy.data.text === trace.data?.text;
  const copiedCI =
    copy.isSuccess &&
    copy.data.kind === "ci" &&
    copy.data.text === ci.data?.text;
  return (
    <section className="panel evidence-panel">
      <div
        className="evidence-tabs"
        role="tablist"
        aria-label="Pipeline evidence"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "logs"
              : event.key === "End"
                ? "ci"
                : tab === "logs"
                  ? "ci"
                  : "logs";
          setTab(next);
          copy.reset();
          document.getElementById(`evidence-tab-${next}`)?.focus();
        }}
      >
        {(["logs", "ci"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`evidence-tab-${value}`}
            aria-controls={`evidence-panel-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => {
              setTab(value);
              copy.reset();
            }}
          >
            {value === "logs" ? (
              <Terminal size={15} />
            ) : (
              <FileCode2 size={15} />
            )}
            {value === "logs" ? "Job logs" : "CI configuration"}
          </button>
        ))}
      </div>
      <div
        id="evidence-panel-logs"
        role="tabpanel"
        aria-labelledby="evidence-tab-logs"
        hidden={tab !== "logs"}
      >
        <div className="panel-heading evidence-toolbar">
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
                copy.isPending
              }
              onClick={() => {
                if (trace.data?.text)
                  copy.mutate({ text: trace.data.text, kind: "logs" });
              }}
            >
              {copiedLogs ? <Check size={13} /> : <Copy size={13} />}
              <span aria-live="polite">
                {copiedLogs ? "Logs copied" : "Copy logs"}
              </span>
            </Button>
          </div>
        </div>
        <ErrorState error={trace.error} />
        <ErrorState error={tab === "logs" ? copy.error : null} />
        {trace.isLoading ? (
          <Loading text="Fetching sanitized job trace…" />
        ) : (
          <pre className="log-view" tabIndex={0} aria-label="Job log output">
            {(trace.data?.text || "No trace available.")
              .split("\n")
              .map((line, index, lines) => (
                <Fragment key={index}>
                  <span
                    className={
                      /\b(error|fatal|failed|traceback|exception)\b|ModuleNotFoundError/i.test(
                        line,
                      )
                        ? "log-error"
                        : undefined
                    }
                  >
                    {line}
                  </span>
                  {index < lines.length - 1 ? "\n" : ""}
                </Fragment>
              ))}
          </pre>
        )}
        {trace.data?.truncated && (
          <p className="panel-note">
            Excerpt only. The middle of this trace has been omitted.
          </p>
        )}
      </div>
      <div
        id="evidence-panel-ci"
        role="tabpanel"
        aria-labelledby="evidence-tab-ci"
        hidden={tab !== "ci"}
      >
        <div className="panel-heading evidence-toolbar">
          <h2>
            <FileCode2 size={15} />
            .gitlab-ci.yml
          </h2>
          <div className="log-actions">
            {fileURL && (
              <a
                className="code-source-link"
                href={fileURL}
                target="_blank"
                rel="noreferrer"
              >
                View in GitLab <ArrowUpRight size={13} />
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={
                !ci.data?.text || ci.isFetching || !!ci.error || copy.isPending
              }
              onClick={() => {
                if (ci.data?.text)
                  copy.mutate({ text: ci.data.text, kind: "ci" });
              }}
            >
              {copiedCI ? <Check size={13} /> : <Copy size={13} />}
              <span aria-live="polite">
                {copiedCI ? "YAML copied" : "Copy YAML"}
              </span>
            </Button>
          </div>
        </div>
        <p className="ci-context">
          {ci.data?.source === "demo"
            ? "Simulated example"
            : "Read-only root file"}
          {ci.data && (
            <>
              {" "}
              · commit{" "}
              <code title={ci.data.commit_sha}>
                {ci.data.commit_sha.slice(0, 12)}
              </code>
            </>
          )}
          <span>
            Files referenced by <code>include</code> are not expanded.
          </span>
        </p>
        <ErrorState error={ci.error} />
        <ErrorState error={tab === "ci" ? copy.error : null} />
        {ci.isFetching && !ci.data ? (
          <Loading text="Fetching CI configuration at this pipeline’s commit…" />
        ) : ci.error ? (
          <div className="ci-retry">
            <Button
              variant="outline"
              onClick={() => ci.refetch()}
              disabled={ci.isFetching}
            >
              <RefreshCw size={14} />
              Retry configuration
            </Button>
          </div>
        ) : ci.data?.text === null ? (
          <Empty
            title="CI configuration unavailable"
            description="The root .gitlab-ci.yml is missing, inaccessible or larger than 500 KB. This project may use a custom CI file path."
          />
        ) : ci.data?.text === "" ? (
          <Empty
            title="Empty CI configuration"
            description="The root .gitlab-ci.yml is empty at this pipeline’s commit."
          />
        ) : ci.data ? (
          <div
            className="ci-code-view"
            tabIndex={0}
            role="region"
            aria-label="CI configuration source"
          >
            <pre className="ci-line-numbers" aria-hidden="true">
              {ci.data
                .text!.split("\n")
                .map((_, i) => i + 1)
                .join("\n")}
            </pre>
            <pre className="ci-source">
              <code
                className="language-yaml"
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </pre>
          </div>
        ) : null}
        {ci.data?.truncated && (
          <p className="panel-note">
            Excerpt only: the beginning of the file is shown (up to 64,000
            characters). Open GitLab to read the complete file.
          </p>
        )}
        {ci.data?.text != null && (
          <p className="panel-note">
            <ShieldCheck size={13} /> Secrets masked on a best-effort basis.
          </p>
        )}
      </div>
    </section>
  );
}
