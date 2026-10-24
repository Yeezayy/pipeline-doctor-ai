import {
  Activity,
  ArrowUpRight,
  FlaskConical,
  GitBranch,
  Github,
  History,
  LayoutDashboard,
  Menu,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace";

const navigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch },
  { to: "/diagnosis", label: "AI Diagnosis", icon: Sparkles },
  { to: "/history", label: "Analysis history", icon: History },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function Layout() {
  const { project, projects, selectProject, settings } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          <span>
            pipeline<span className="brand-light">doctor</span>
            <small>AI TROUBLESHOOTING</small>
          </span>
        </Link>
        <button
          className="mobile-close"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-select">
          <span className="project-avatar">
            {settings?.demo_mode ? "A" : "G"}
          </span>
          <select
            aria-label="Current project"
            value={project?.id || ""}
            onChange={(e) => selectProject(e.target.value)}
          >
            {!projects.length && <option value="">No project connected</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="nav-label">WORKBENCH</div>
        <nav>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <item.icon size={17} />
              {item.label}
              {item.label === "AI Diagnosis" && (
                <span className="nav-ai">AI</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="live-dot" />
            <strong>Local-first. Human-led.</strong>
            <p>
              AI suggests. You review.
              <br />
              Nothing runs without you.
            </p>
          </div>
          <a
            className="source-link"
            href="https://github.com/Yeezayy/pipeline-doctor-ai"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={15} /> Open source workbench{" "}
            <ArrowUpRight size={13} />
          </a>
          <div className="version">
            PIPELINE DOCTOR <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button"
              onClick={() => setOpen(!open)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{project?.name || "Get started"}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`mode-pill ${settings?.demo_mode ? "" : "live-mode"}`}
            >
              {settings ? (
                settings.demo_mode ? (
                  <>
                    <FlaskConical size={12} /> Demo workspace
                  </>
                ) : (
                  <>
                    <span className="live-dot" /> Live integration
                  </>
                )
              ) : (
                "Connecting…"
              )}
            </span>
            <span className="user-avatar">PD</span>
          </div>
        </header>
        {settings?.demo_mode && (
          <div className="demo-banner">
            <FlaskConical size={14} />
            <span>
              <strong>You’re exploring the demo.</strong> Pipelines, logs and AI
              responses are simulated.
            </span>
            <Link to="/settings">
              Connect GitLab <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main>
          <Outlet />
        </main>
        <footer>
          Built for the moments when CI says no.
          <span>Evidence first. Guesswork last.</span>
        </footer>
      </div>
    </div>
  );
}
