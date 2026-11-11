import { Fragment } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Download, FileDiff, RefreshCw } from "lucide-react";
import { api } from "../services/api";
import type { Analysis } from "../types";
import { Button } from "./ui/button";
import { ErrorState } from "./common";

export function FixPreview({ analysis }: { analysis: Analysis }) {
  const generate = useMutation({ mutationFn: () => api.fixes(analysis.id) });
  const copy = useMutation({
    mutationFn: async (diff: string) => {
      try {
        await navigator.clipboard.writeText(diff);
        return diff;
      } catch {
        throw new Error(
          "Could not access the clipboard. Download the patch or copy the displayed diff instead.",
        );
      }
    },
  });
  const patch = generate.data;
  const copied = copy.isSuccess && copy.data === patch?.diff;
  return (
    <section className="panel patch-panel">
      <div className="panel-heading">
        <h2>
          <FileDiff size={16} />
          Suggested CI patch
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={generate.isPending}
          onClick={() => {
            copy.reset();
            generate.mutate();
          }}
        >
          {generate.isPending ? (
            <RefreshCw size={14} className="spin" />
          ) : (
            <FileDiff size={14} />
          )}
          {generate.isPending
            ? "Preparing patch…"
            : patch
              ? "Generate another patch"
              : "Generate patch"}
        </Button>
      </div>
      <p className="patch-intro">
        {analysis.source === "demo"
          ? "Simulated patch preview. Pipeline #1043 includes a fixed example."
          : "Propose a change to the root .gitlab-ci.yml at this diagnosis’s commit."}{" "}
        Review the diff and validation steps before applying it.
      </p>
      <ErrorState error={generate.error} />
      {patch && (
        <div className="patch-result">
          <h3>{patch.summary}</h3>
          <p>{patch.explanation}</p>
          <p className="patch-base">
            Base commit{" "}
            <code title={patch.base_sha}>{patch.base_sha.slice(0, 12)}</code> ·{" "}
            {patch.source === "demo" ? "Simulated" : "AI suggested"} · Jobs not
            run
          </p>
          {patch.status === "ready" && patch.diff && (
            <>
              <div className="patch-toolbar">
                <span className="patch-checks">
                  {patch.applicability_checked && "Source match verified"}
                  {patch.yaml_syntax_valid && " · YAML syntax valid"}
                </span>
                <div className="button-row">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={copy.isPending}
                    onClick={() => copy.mutate(patch.diff!)}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span aria-live="polite">
                      {copied ? "Patch copied" : "Copy patch"}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([patch.diff!], {
                          type: "text/plain;charset=utf-8",
                        }),
                      );
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = "pipeline-doctor-ci.patch";
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={13} />
                    Download patch
                  </Button>
                </div>
              </div>
              <ErrorState error={copy.error} />
              <pre
                className="patch-diff"
                tabIndex={0}
                aria-label="Proposed CI patch"
              >
                <code>
                  {patch.diff.split("\n").map((line, index, lines) => (
                    <Fragment key={index}>
                      <span
                        className={
                          line.startsWith("+++") ||
                          line.startsWith("---") ||
                          line.startsWith("@@")
                            ? "diff-header"
                            : line.startsWith("+")
                              ? "diff-added"
                              : line.startsWith("-")
                                ? "diff-removed"
                                : undefined
                        }
                      >
                        {line}
                      </span>
                      {index < lines.length - 1 ? "\n" : ""}
                    </Fragment>
                  ))}
                </code>
              </pre>
              <h4>Before applying</h4>
              <ol className="patch-steps">
                {patch.verification_steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </>
          )}
          {patch.limitations.length > 0 && (
            <div className="patch-limitations">
              <h4>Scope & limitations</h4>
              <ul>
                {patch.limitations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
