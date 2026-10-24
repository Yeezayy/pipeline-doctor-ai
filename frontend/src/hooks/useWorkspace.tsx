import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { Project, Settings } from "../types";

interface Workspace {
  project?: Project;
  projects: Project[];
  selectProject: (id: string) => void;
  settings?: Settings;
  loading: boolean;
  error: Error | null;
}
const Context = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState(localStorage.getItem("doctor-project") || "");
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
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
        loading: settings.isLoading || projects.isLoading,
        error: settings.error || projects.error,
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
