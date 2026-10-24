import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  HashRouter,
  Link,
  Route,
  Routes,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceProvider } from "./hooks/useWorkspace";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Pipelines, PipelineDetail } from "./pages/Pipelines";
import { Diagnosis } from "./pages/Diagnosis";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Landing } from "./pages/Landing";
import "./styles.css";
import { PUBLIC_DEMO } from "./lib/deployment";

const Router = PUBLIC_DEMO ? HashRouter : BrowserRouter;

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <Router>
        <WorkspaceProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<Layout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pipelines" element={<Pipelines />} />
              <Route
                path="pipelines/:projectId/:pipelineId"
                element={<PipelineDetail />}
              />
              <Route path="diagnosis" element={<Diagnosis />} />
              <Route path="diagnosis/:analysisId" element={<Diagnosis />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route
                path="*"
                element={
                  <div className="state">
                    <h1>Page not found.</h1>
                    <Link to="/dashboard">Back to the workbench →</Link>
                  </div>
                }
              />
            </Route>
          </Routes>
        </WorkspaceProvider>
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
);
