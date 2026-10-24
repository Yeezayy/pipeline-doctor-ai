import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import type { AuthSession, Project, Settings } from "../types";
import { useLocation } from "react-router-dom";

interface Workspace {
  project?: Project;
  projects: Project[];
  selectProject: (id: string) => void;
  settings?: Settings;
  auth?: AuthSession;
  loading: boolean;
  error: Error | null;
}
const Context = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const location = useLocation();
  const [id, setId] = useState(localStorage.getItem("doctor-project") || "");
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const auth = useQuery({ queryKey: ["auth"], queryFn: api.me, retry: false });
  const needsLogin = settings.data?.auth_mode === "gitlab";
  const canAccess =
    !!settings.data && (!needsLogin || !!auth.data?.authenticated);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects,
    enabled: canAccess && location.pathname !== "/",
  });
  useEffect(() => {
    const expired = () => {
      client.setQueryData<AuthSession>(["auth"], {
        mode: "gitlab",
        authenticated: false,
        user: null,
        csrf_token: null,
      });
      client.removeQueries({
        predicate: (query) =>
          !["auth", "settings"].includes(String(query.queryKey[0])),
      });
    };
    window.addEventListener("doctor:session-expired", expired);
    return () => window.removeEventListener("doctor:session-expired", expired);
  }, [client]);
  const project = projects.data?.find((p) => p.id === id) || projects.data?.[0];
  useEffect(() => {
    if (project) localStorage.setItem("doctor-project", project.id);
  }, [project]);
  return (
    <Context.Provider
      value={{
        project,
        projects: projects.data || [],
        selectProject: setId,
        settings: settings.data,
        auth: auth.data,
        loading:
          settings.isLoading ||
          (needsLogin && auth.isLoading) ||
          (canAccess && projects.isLoading),
        error:
          settings.error || (needsLogin ? auth.error : null) || projects.error,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
