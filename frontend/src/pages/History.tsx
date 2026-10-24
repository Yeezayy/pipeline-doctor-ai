import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, Sparkles, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { PUBLIC_DEMO } from "../lib/deployment";
import { date } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Empty, ErrorState, Loading, PageHeading } from "../components/common";

export function History() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["analyses"], queryFn: api.history });
  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: () => client.invalidateQueries({ queryKey: ["analyses"] }),
  });
  return (
    <>
      <PageHeading
        eyebrow="YOUR INVESTIGATIONS"
        title="A little wiser, every run."
        description={
          PUBLIC_DEMO
            ? "Simulated diagnoses kept only in this tab’s memory. Reloading clears the demo history."
            : "Saved diagnoses and conversations. Sanitized evidence, never raw job logs."
        }
      />
      <ErrorState error={query.error || remove.error} />
      {query.isLoading ? (
        <Loading />
      ) : !query.data?.length ? (
        <Empty
          title="A clean slate."
          description="Your diagnoses will appear here after you inspect a failed job."
          action={
            <Button asChild>
              <Link to="/pipelines">
                Explore pipelines
                <ArrowUpRight size={14} />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="history-grid">
          {query.data.map((a) => (
            <article className="panel history-card" key={a.id}>
              <div className="history-top">
                <span className="diagnosis-icon">
                  <Sparkles size={18} />
                </span>
                <span className="context-tag">
                  {a.source === "demo" ? "Simulated" : "Live analysis"}
                </span>
              </div>
              <Link to={`/diagnosis/${a.id}`}>
                <h2>{a.diagnosis.summary}</h2>
                <p>{a.diagnosis.root_cause}</p>
              </Link>
              <div className="history-meta">
                <code>
                  #{a.pipeline_id} / {a.job_name}
                </code>
                <span>
                  <Clock3 size={12} />
                  {date(a.created_at)}
                </span>
              </div>
              <div className="history-actions">
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/diagnosis/${a.id}`}>
                    Open diagnosis
                    <ArrowUpRight size={13} />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete analysis for ${a.job_name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete this diagnosis and its conversation?",
                      )
                    )
                      remove.mutate(a.id);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
