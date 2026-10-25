import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, GitBranch, LogOut, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "./ui/button";
import { ErrorState, Loading, PageHeading } from "./common";

const REVOCATION_WARNING = "doctor-gitlab-revocation-pending";

export function GitLabAccount({ gate = false }: { gate?: boolean }) {
  const { settings, auth, loading, error } = useWorkspace();
  const [params] = useSearchParams();
  const [revocationPending, setRevocationPending] = useState(
    () => sessionStorage.getItem(REVOCATION_WARNING) === "true",
  );
  const authorizedAppsURL = `${(settings?.gitlab_url || "https://gitlab.com").replace(/\/$/, "")}/-/user_settings/applications`;
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (data) => window.location.assign(data.authorization_url),
  });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: (result) => {
      if (result.revocation === "unconfirmed") {
        sessionStorage.setItem(REVOCATION_WARNING, "true");
      }
      // A previous warning is cleared only by explicit manual confirmation.
      localStorage.removeItem("doctor-project");
      // A full navigation discards private query caches and the in-memory CSRF token.
      window.location.assign("/settings");
    },
  });
  if (gate && loading) return <Loading text="Checking your GitLab session…" />;
  return (
    <>
      {gate && (
        <PageHeading
          eyebrow="YOUR PERSONAL WORKSPACE"
          title="Connect your GitLab account."
          description="Review GitLab's read-only API permissions before connecting. GitLab tokens stay on the local backend."
        />
      )}
      <section className="panel settings-card">
        <div className="settings-title">
          <span className="settings-icon">
            <GitBranch size={21} />
          </span>
          <div>
            <h2>
              {auth?.authenticated
                ? `Connected as @${auth.user?.username}`
                : "Sign in with GitLab"}
            </h2>
            <p>
              {auth?.authenticated
                ? auth.user?.name
                : "Your projects and analyses belong to your own account."}
            </p>
          </div>
        </div>
        <div className="configuration-note">
          <ShieldCheck size={16} />
          <p>
            Read-only API access. Encrypted server-side tokens and an HttpOnly
            session cookie. No GitLab password or personal token to paste here.
          </p>
        </div>
        <div className="configuration-note">
          <ShieldCheck size={16} />
          <p>
            Requested permission: <code>read_api</code>. GitLab grants read
            access to API resources your account can access, not just the
            projects you connect here. Pipeline Doctor lists available projects
            and only inspects pipelines, job logs and CI files for projects you
            explicitly connect. Selecting a project does not restrict the GitLab
            token itself. No Git write or Git-over-HTTP access is requested.
          </p>
        </div>
        {revocationPending && (
          <div className="configuration-note" role="alert">
            <AlertTriangle size={16} />
            <div>
              <p>
                <strong>GitLab revocation not confirmed.</strong> A local
                session was closed, but its GitLab authorization may still be
                active. Open GitLab’s Authorized applications section and revoke
                Pipeline Doctor AI manually. If you have reconnected since then,
                revoking access can also require reconnecting your current
                session.
              </p>
              <p>
                <a href={authorizedAppsURL} target="_blank" rel="noreferrer">
                  Open GitLab authorized applications
                </a>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionStorage.removeItem(REVOCATION_WARNING);
                  setRevocationPending(false);
                }}
              >
                I revoked access in GitLab
              </Button>
            </div>
          </div>
        )}
        {params.get("gitlab") === "error" && (
          <ErrorState
            error={
              new Error(
                "GitLab authorization was cancelled, expired or failed. Please try connecting again.",
              )
            }
          />
        )}
        <ErrorState
          error={login.error || logout.error || (gate ? error : null)}
        />
        {auth?.authenticated ? (
          <Button
            variant="outline"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut size={14} />
            {logout.isPending ? "Disconnecting…" : "Disconnect GitLab"}
          </Button>
        ) : (
          <Button
            onClick={() => login.mutate()}
            disabled={!settings?.oauth_configured || login.isPending}
          >
            <GitBranch size={15} />
            {login.isPending
              ? "Redirecting to GitLab…"
              : "Continue with GitLab"}
          </Button>
        )}
        <p className="panel-note">
          {auth?.authenticated
            ? "Disconnect ends this browser session and attempts to revoke its GitLab grant. Saved analyses remain private to your account."
            : `You will be redirected to ${settings?.gitlab_url || "the configured GitLab instance"} to review the requested permissions.`}
        </p>
      </section>
    </>
  );
}
