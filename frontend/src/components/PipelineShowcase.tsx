import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";

const Scene = lazy(() => import("../features/landing/PipelineScene"));
const stages = [
  {
    name: "Checkout",
    status: "passed",
    detail: "Source checked out. The example run has its code ready.",
  },
  {
    name: "Install",
    status: "passed",
    detail:
      "Dependencies installed. The failure happens further down the graph.",
  },
  {
    name: "Build",
    status: "failed",
    detail:
      "Dockerfile not found. This is the failure to investigate, not a reason to retry blindly.",
  },
  {
    name: "Test",
    status: "blocked",
    detail: "Tests cannot run because the earlier build failed.",
  },
  {
    name: "Deploy",
    status: "blocked",
    detail: "Deployment stays blocked. No change is applied by the assistant.",
  },
];

function Fallback() {
  return (
    <div className="landing-3d-fallback">
      <div>
        {stages.map((stage) => (
          <span key={stage.name} className={`fallback-node ${stage.status}`} />
        ))}
      </div>
      <span>Pipeline illustration · interactive controls below</span>
    </div>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

export function PipelineShowcase() {
  const [selected, setSelected] = useState(2);
  const [webgl, setWebgl] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    const updateVisibility = () => setTabVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "80px" },
    );
    if (container.current) observer.observe(container.current);
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      setWebgl(!!context);
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setWebgl(false);
    }
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      document.body.style.cursor = "";
    };
  }, []);
  const stage = stages[selected];
  return (
    <section
      ref={container}
      className="landing-showcase landing-wrap"
      aria-label="Interactive pipeline illustration"
    >
      <div className="landing-showcase-heading">
        <span className="landing-section-marker">ANATOMY OF A FAILED RUN</span>
        <span className="landing-demo-label">
          ILLUSTRATIVE SCENE · NOT LIVE GITLAB DATA
        </span>
        {webgl && !reduced && (
          <button
            aria-label={paused ? "Play 3D animation" : "Pause 3D animation"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        )}
      </div>
      <div className="landing-3d-stage" aria-hidden="true">
        <SceneBoundary>
          <Suspense fallback={<Fallback />}>
            {webgl && visible ? (
              <Scene
                selected={selected}
                onSelect={setSelected}
                animated={visible && tabVisible && !reduced && !paused}
              />
            ) : (
              <Fallback />
            )}
          </Suspense>
        </SceneBoundary>
      </div>
      <div
        className="landing-stage-picker"
        role="group"
        aria-label="Select a pipeline stage"
      >
        {stages.map((item, i) => (
          <button
            key={item.name}
            aria-pressed={selected === i}
            aria-label={`Select ${item.name.toLowerCase()} stage`}
            onClick={() => setSelected(i)}
          >
            <span className={`landing-stage-dot ${item.status}`} />
            <span>{item.name}</span>
            <small>{String(i + 1).padStart(2, "0")}</small>
          </button>
        ))}
      </div>
      <div className="landing-stage-description">
        <div aria-live="polite">
          <span className={`landing-stage-status ${stage.status}`}>
            {stage.status}
          </span>
          <p>{stage.detail}</p>
        </div>
        <Link to="/pipelines">
          Inspect a pipeline
          <ArrowUpRight size={13} />
        </Link>
      </div>
      <span className="landing-3d-hint">
        {webgl
          ? reduced
            ? "Reduced motion enabled · select a stage to explore"
            : "Drag to orbit · select a stage to explore"
          : "WebGL unavailable · the pipeline remains explorable without 3D"}
      </span>
    </section>
  );
}
