import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { api } from "../services/api";
import { Button } from "../components/ui/button";
import { Empty, ErrorState, Loading, PageHeading } from "../components/common";
import type { Analysis } from "../types";

function Chat({ analysis }: { analysis: Analysis }) {
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const bottom = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (text: string) => api.chat(analysis.id, text),
    onSuccess: (data) => {
      client.setQueryData(["analysis", analysis.id], data);
      setMessage("");
    },
  });
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [analysis.messages.length]);
  const send = (text: string) => {
    if (text.trim() && !mutation.isPending) mutation.mutate(text.trim());
  };
  return (
    <section className="panel chat-panel">
      <div className="panel-heading">
        <h2>
          <MessageSquare size={16} />
          Ask Doctor
        </h2>
        <span className="context-tag">Context attached</span>
      </div>
      <div className="chat-intro">
        <span className="bot-icon">
          <Bot size={21} />
        </span>
        <h3>A little more clarity?</h3>
        <p>
          I have this diagnosis in context.
          <br />
          Let’s work through what to check next.
        </p>
      </div>
      <div className="chat-messages" aria-live="polite">
        {analysis.messages.map((m) => (
          <div className={`message message-${m.role}`} key={m.id}>
            <span>
              {m.role === "user"
                ? "YOU"
                : analysis.source === "demo"
                  ? "DOCTOR · SIMULATED"
                  : "DOCTOR"}
            </span>
            <p>{m.content}</p>
          </div>
        ))}
        {mutation.isPending && (
          <p className="thinking">
            <Sparkles size={13} className="spin" />
            Reading the context…
          </p>
        )}
        <div ref={bottom} />
      </div>
      {!analysis.messages.length && (
        <div className="chat-suggestions">
          {[
            "What should I check before retrying?",
            "Explain the root cause simply.",
          ].map((text) => (
            <button
              key={text}
              onClick={() => send(text)}
              disabled={mutation.isPending}
            >
              {text}
              <ArrowRight size={12} />
            </button>
          ))}
        </div>
      )}
      <ErrorState error={mutation.error} />
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(message);
        }}
      >
        <label htmlFor="message" className="sr-only">
          Ask a follow-up question
        </label>
        <textarea
          id="message"
          placeholder="Ask about this failure…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          rows={2}
        />
        <button
          type="submit"
          disabled={!message.trim() || mutation.isPending}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
      <p className="chat-disclaimer">
        {analysis.source === "demo"
          ? "Demo replies are fixed examples, not LLM-generated."
          : "AI can be wrong. Verify recommendations before acting."}
      </p>
    </section>
  );
}

export function Diagnosis() {
  const { analysisId = "" } = useParams();
  const query = useQuery({
    queryKey: ["analysis", analysisId],
    queryFn: () => api.analysis(analysisId),
    enabled: !!analysisId,
  });
  if (!analysisId)
    return (
      <>
        <PageHeading
          eyebrow="AI DIAGNOSIS"
          title="Clarity starts with a failure."
          description="Choose a failed job to create an evidence-backed diagnosis."
        />
        <Empty
          title="Ready when your pipeline isn’t."
          description="Open a pipeline, select its failed job, then click Diagnose this job. Or revisit a previous analysis."
          action={
            <div className="button-row">
              <Button asChild>
                <Link to="/pipelines">
                  Inspect pipelines
                  <ArrowRight size={14} />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/history">View history</Link>
              </Button>
            </div>
          }
        />
      </>
    );
  if (query.isLoading) return <Loading text="Opening diagnosis…" />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return null;
  const analysis = query.data;
  const d = analysis.diagnosis;
  return (
    <>
      <Link
        className="back-link"
        to={`/pipelines/${analysis.project_id}/${analysis.pipeline_id}`}
      >
        <ArrowLeft size={14} />
        Pipeline #{analysis.pipeline_id}
        <ChevronRight size={12} />
        {analysis.job_name}
      </Link>
      <PageHeading
        eyebrow="THE INVESTIGATION"
        title="From red to understood."
        description={
          analysis.source === "demo"
            ? "Example diagnosis · simulated incident · no external LLM called"
            : "AI-assisted diagnosis · review all recommendations before applying"
        }
        action={
          <span className={`severity severity-${d.severity}`}>
            {d.severity} severity
          </span>
        }
      />
      <div className="diagnosis-grid">
        <div className="diagnosis-main">
          <section className="panel diagnosis-summary">
            <div className="diagnosis-title">
              <span className="diagnosis-icon">
                <Sparkles size={21} />
              </span>
              <div>
                <span className="eyebrow">PROBABLE ROOT CAUSE</span>
                <h2>{d.summary}</h2>
              </div>
            </div>
            <p className="root-cause">{d.root_cause}</p>
            <div className="confidence">
              <span>
                Model confidence{" "}
                <strong>{Math.round(d.confidence * 100)}%</strong>
              </span>
              <div className="confidence-track">
                <i style={{ width: `${d.confidence * 100}%` }} />
              </div>
              <small>An estimate, not a verified probability.</small>
            </div>
          </section>
          <section className="panel evidence-panel">
            <div className="panel-heading">
              <h2>
                <Terminal size={15} />
                The evidence
              </h2>
              <span className="eyebrow">OBSERVED</span>
            </div>
            {d.evidence.length ? (
              d.evidence.map((e, i) => (
                <pre className="evidence" key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <code>{e}</code>
                </pre>
              ))
            ) : (
              <p className="panel-note">
                No exact supporting excerpt was returned. Treat the diagnosis as
                uncertain.
              </p>
            )}
            <div className="explanation">
              <h3>What this means</h3>
              <p>{d.explanation}</p>
            </div>
          </section>
          <section className="panel fixes-panel">
            <div className="panel-heading">
              <h2>
                <Check size={16} />
                Recommended next steps
              </h2>
              <span className="untested">Not tested</span>
            </div>
            <ol>
              {d.suggested_fixes.map((fix, i) => (
                <li key={i}>
                  <span>{i + 1}</span>
                  <p>{fix}</p>
                </li>
              ))}
            </ol>
            <div className="human-review">
              <ShieldCheck size={15} />
              Nothing has been changed. Review and test every recommendation.
            </div>
          </section>
          {d.hypotheses.length > 0 && (
            <section className="panel hypotheses">
              <div className="panel-heading">
                <h2>Assumptions & limitations</h2>
              </div>
              <ul>
                {d.hypotheses.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <Chat analysis={analysis} />
      </div>
    </>
  );
}
