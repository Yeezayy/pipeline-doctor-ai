import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  GitBranch,
  Github,
  LockKeyhole,
  Menu,
  MessageSquare,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { PipelineShowcase } from "../components/PipelineShowcase";
import { LOCAL_SETUP_URL, PUBLIC_DEMO } from "../lib/deployment";
import "./Landing.css";

const repository = "https://github.com/Yeezayy/pipeline-doctor-ai";

export function Landing() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash)
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);
  const { settings, auth } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState<"diagnosis" | "dashboard">(
    "diagnosis",
  );
  const demo = !!settings?.demo_mode;
  const primary = auth?.authenticated
    ? "Open your workbench"
    : demo
      ? "Explore the demo"
      : settings?.auth_mode === "gitlab"
        ? "Connect your GitLab"
        : "Open the workbench";
  const destination = demo || auth?.authenticated ? "/dashboard" : "/settings";
  return (
    <div className="landing">
      <Link className="landing-skip" to="/#landing-content">
        Skip to content
      </Link>
      <header className="landing-header">
        <Link
          to="/"
          className="landing-brand"
          aria-label="Pipeline Doctor home"
        >
          <span>
            <Activity size={23} />
          </span>
          pipeline<span className="landing-brand-light">doctor</span>
          <sup>AI</sup>
        </Link>
        <nav
          aria-label="Main navigation"
          className={menu ? "landing-nav is-open" : "landing-nav"}
        >
          <Link to="/#product" onClick={() => setMenu(false)}>
            The product
          </Link>
          <Link to="/#workflow" onClick={() => setMenu(false)}>
            How it works
          </Link>
          <Link to="/#principles" onClick={() => setMenu(false)}>
            Our approach
          </Link>
        </nav>
        <div className="landing-header-actions">
          <a
            className="landing-github"
            href={repository}
            target="_blank"
            rel="noreferrer"
            aria-label="Source on GitHub"
          >
            <Github size={19} />
          </a>
          <Link className="landing-nav-cta" to={destination}>
            {demo ? "Try the demo" : "Get started"}
            <ArrowUpRight size={14} />
          </Link>
          <button
            className="landing-menu"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <div id="landing-content">
        <section className="landing-hero landing-wrap">
          <div className="landing-hero-top">
            <span className="landing-kicker">
              <i />
              AN OPEN-SOURCE CI INVESTIGATION WORKBENCH
            </span>
            <span className="landing-edition">GITLAB FIRST. HUMAN ALWAYS.</span>
          </div>
          <div className="landing-hero-grid">
            <div>
              <h1>
                Your pipeline failed.
                <br />
                Your momentum
                <br />
                <em>shouldn’t.</em>
                <span className="landing-period">_</span>
              </h1>
            </div>
            <div className="landing-hero-copy">
              <span className="landing-section-marker">
                [ LESS NOISE. MORE SIGNAL. ]
              </span>
              <p>
                Turn a wall of CI logs into a clear next step. Find the probable
                cause, follow the evidence, and get back to shipping.
              </p>
              <div className="landing-hero-buttons">
                <Link className="landing-cta" to={destination}>
                  {primary}
                  <ArrowUpRight size={17} />
                </Link>
                {PUBLIC_DEMO ? (
                  <a
                    className="landing-secondary"
                    href={LOCAL_SETUP_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Run locally
                    <ArrowUpRight size={15} />
                  </a>
                ) : (
                  <Link className="landing-secondary" to="/settings">
                    {demo ? "Connect GitLab" : "Integration settings"}
                    <ArrowRight size={15} />
                  </Link>
                )}
              </div>
              <span className="landing-smallprint">
                {demo
                  ? "No signup. No API key. Explicitly simulated incidents."
                  : "Read-only investigation. No automatic code changes."}
              </span>
            </div>
          </div>
          <div className="landing-hero-baseline">
            <span>
              <GitBranch size={14} /> AI-Powered GitLab CI/CD Troubleshooting
            </span>
            <Link to="/#product">
              MEET YOUR SECOND PAIR OF EYES <ArrowDown size={14} />
            </Link>
          </div>
        </section>

        <PipelineShowcase />
        <section
          className="landing-product landing-wrap"
          id="product"
          aria-labelledby="product-heading"
        >
          <div className="landing-product-bar">
            <div>
              <span className="landing-window-dot" />
              <span className="landing-window-dot" />
              <span className="landing-window-dot" />
              <span className="landing-product-url">
                pipeline doctor / the workbench
              </span>
            </div>
            <span className="landing-demo-label">
              PRODUCT CAPTURES · SIMULATED DATA
            </span>
          </div>
          <div
            className="landing-preview-tabs"
            role="group"
            aria-label="Product preview"
          >
            <button
              aria-pressed={preview === "diagnosis"}
              onClick={() => setPreview("diagnosis")}
            >
              <Sparkles size={14} />
              AI diagnosis
            </button>
            <button
              aria-pressed={preview === "dashboard"}
              onClick={() => setPreview("dashboard")}
            >
              <Activity size={14} />
              Pipeline overview
            </button>
            <span>Evidence first. Guesswork last.</span>
          </div>
          <div className="landing-preview">
            <img
              key={preview}
              src={`${import.meta.env.BASE_URL}product/${preview}.png`}
              alt={
                preview === "diagnosis"
                  ? "Actual demo interface showing a missing Dockerfile diagnosis, exact evidence, untested recommendations and simulated chat"
                  : "Actual demo dashboard showing nine simulated pipelines, status counts and saved example diagnoses"
              }
              width="1440"
              height={preview === "diagnosis" ? 1208 : 1221}
              fetchPriority="high"
            />
          </div>
          <div className="landing-product-caption">
            <h2 id="product-heading">One failure. The whole picture.</h2>
            <p>
              Logs, a structured diagnosis and a contextual assistant.
              <br />
              Not another tab full of guesses.
            </p>
            <Link to={destination} aria-label="Open the product workbench">
              <ArrowUpRight size={25} />
            </Link>
          </div>
        </section>

        <div className="landing-stack-strip landing-wrap">
          <span>BUILT WITH TOOLS YOU KNOW</span>
          <div>
            <strong>GitLab</strong>
            <b>/</b>
            <strong>React</strong>
            <b>/</b>
            <strong>FastAPI</strong>
            <b>/</b>
            <strong>LangChain</strong>
            <b>/</b>
            <strong>PostgreSQL</strong>
          </div>
          <span>NOT AFFILIATED WITH GITLAB</span>
        </div>

        <section className="landing-workflow landing-wrap" id="workflow">
          <div className="landing-section-heading">
            <span className="landing-section-marker">01 / THE WORKFLOW</span>
            <h2>
              From “why is it red?”
              <br />
              to “here’s what to check.”
            </h2>
            <p>
              Less log archaeology.
              <br />A more deliberate way to debug CI.
            </p>
          </div>
          <div className="landing-steps">
            {[
              {
                n: "01",
                icon: GitBranch,
                title: "Bring the failure.",
                text: "Connect a GitLab project. Pick a failed pipeline, inspect its jobs, and read the sanitized trace.",
              },
              {
                n: "02",
                icon: ScanLine,
                title: "Find the signal.",
                text: "Get a structured diagnosis with exact evidence, a probable root cause, explicit hypotheses and recommended checks.",
              },
              {
                n: "03",
                icon: MessageSquare,
                title: "Ask the next question.",
                text: "Dig deeper with an assistant that has the diagnosis in context. Save the investigation. Review every fix yourself.",
              },
            ].map((step) => (
              <article key={step.n}>
                <div className="landing-step-top">
                  <span>{step.n}</span>
                  <step.icon size={24} strokeWidth={1.3} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-principles" id="principles">
          <div className="landing-wrap landing-principles-grid">
            <div className="landing-principles-intro">
              <span className="landing-section-marker">
                02 / BUILT WITH RESTRAINT
              </span>
              <h2>
                AI that helps.
                <br />
                <em>Not AI that takes over.</em>
              </h2>
              <p>
                Your CI is infrastructure, not a playground. The workbench is
                designed to investigate, explain and recommend — never quietly
                change your project.
              </p>
              <a
                className="landing-secondary"
                href={`${repository}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer"
              >
                Read the security boundaries
                <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="landing-principle-list">
              {[
                {
                  icon: Braces,
                  title: "Show your working.",
                  text: "Observed evidence stays separate from hypotheses. Confidence is an estimate. Proposed fixes are explicitly untested.",
                },
                {
                  icon: LockKeyhole,
                  title: "Smaller data footprint.",
                  text: "Credentials stay on the server. Logs are masked before model calls. Raw traces aren’t archived. Masking is best effort, not a guarantee.",
                },
                {
                  icon: ShieldCheck,
                  title: "You stay in the loop.",
                  text: "No shell access for the model. No automatic retries, code changes or merge requests. Your approval isn’t an afterthought.",
                },
              ].map((item) => (
                <article key={item.title}>
                  <item.icon size={22} strokeWidth={1.4} />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                  <Check size={15} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-open-source landing-wrap">
          <span className="landing-section-marker">03 / NO BLACK BOX</span>
          <div>
            <h2>
              Open source.
              <br />
              Open to your scrutiny.
            </h2>
            <div>
              <p>
                Read the code. Run it locally. Inspect the tradeoffs.
                <br />A focused MVP with a real demo, tests and documented
                limitations — not a promise to fix everything.
              </p>
              <a
                className="landing-cta landing-cta-outline"
                href={repository}
                target="_blank"
                rel="noreferrer"
              >
                <Github size={17} />
                Explore the repository
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
          <div className="landing-facts">
            <span>
              <Check size={14} />
              MIT licensed
            </span>
            <span>
              <Check size={14} />
              Self-hostable with Docker
            </span>
            <span>
              <Check size={14} />
              Six demo failure scenarios
            </span>
            <span>
              <Check size={14} />
              No autonomous fixes
            </span>
          </div>
        </section>

        <section className="landing-final landing-wrap">
          <span className="landing-kicker">
            <i />
            LESS FIREFIGHTING. MORE SHIPPING.
          </span>
          <h2>
            Your next green run
            <br />
            starts with <em>understanding.</em>
          </h2>
          <Link className="landing-cta" to={destination}>
            {primary}
            <ArrowUpRight size={19} />
          </Link>
          <p>
            {PUBLIC_DEMO
              ? "This website is a simulated demo. Real projects and credentials stay in your local installation."
              : demo
                ? "Explore the simulated workbench. Connect a real instance when you’re ready."
                : "Connect your account on this instance, or run your own deployment."}
          </p>
        </section>
      </div>
      <footer className="landing-footer landing-wrap">
        <Link className="landing-brand" to="/">
          <Activity size={19} />
          pipeline<span className="landing-brand-light">doctor</span>
        </Link>
        <span>AI-Powered GitLab CI/CD Troubleshooting</span>
        <div>
          <a
            href={`${repository}/blob/main/README.md`}
            target="_blank"
            rel="noreferrer"
          >
            Documentation
            <ArrowUpRight size={12} />
          </a>
          <a href={repository} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight size={12} />
          </a>
          <small>Independent open-source project · MIT</small>
        </div>
      </footer>
    </div>
  );
}
