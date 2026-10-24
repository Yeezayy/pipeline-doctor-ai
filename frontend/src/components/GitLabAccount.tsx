import { useMutation } from "@tanstack/react-query";
import { GitBranch, LogOut, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "./ui/button";
import { ErrorState, Loading, PageHeading } from "./common";

export function GitLabAccount({ gate = false }: { gate?: boolean }) {
  const { settings, auth, loading, error } = useWorkspace();
  const [params] = useSearchParams();
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (data) => window.location.assign(data.authorization_url),
  });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
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
          description="Authorize read-only access to your projects. Your credentials never enter the browser."
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
            Read-only project access. Encrypted server-side tokens and an
            HttpOnly session cookie. No GitLab password or personal token to
            paste here.
          </p>
        </div>
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
