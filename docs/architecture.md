# Architecture decisions

## Request flow and boundaries

`frontend/src/services/api.ts` owns HTTP calls. TanStack Query manages server state; the workspace provider holds the selected connected project. The browser never receives a GitLab or LLM token. nginx supplies the same-origin API proxy in Compose; Vite supplies it in development.

`backend/app/api/routes.py` validates HTTP input, enforces source isolation and coordinates use cases. `services/pipelines.py` loads GitLab/domain context and persists connected projects. `integrations/gitlab.py` is the sole GitLab HTTP boundary. `ai/diagnostician.py` owns provider configuration, trusted system instructions, untrusted prompt data, structured parsing and evidence checks. `core/security.py` masks text before display, model calls or persistence.

These are small modules, not a repository/service/interface hierarchy around every SQL query. SQLAlchemy is used directly where persistence is simple. The session dependency owns request lifetime; no global ORM session is shared.

## Why these tradeoffs?

### Explicit demo adapter, not silent fallback

The deployment chooses `DEMO_MODE` server-side. The demo has six curated incidents and never contacts GitLab or a provider. Live mode never falls back on simulation. Database rows carry `demo`/`live` source and API reads enforce that boundary. This is isolation for presentation, not tenant authorization.

### Small, structured LLM calls

One LangChain `ChatOpenAI` call produces a Pydantic diagnosis. There is no agent with shell/repository tools. Logs are redacted, then reduced to a quarter-head/three-quarter-tail excerpt. The file/context budgets are separate and documented. Only verbatim evidence found in the supplied log/CI excerpt survives validation. This cannot establish that an explanation is correct; the output still labels hypotheses and untested recommendations.

Chat uses the persisted diagnosis and pipeline metadata plus the last 10 messages. It cannot recover omitted original logs or execute fixes. Demo chat is a plainly marked fixed template, not a fake LLM.

### PostgreSQL by default in Compose, SQLite for a fast local loop

Alembic, not `create_all`, owns the application schema. Projects contain source and GitLab identity. Analyses contain IDs, sanitized job name, pipeline metadata and structured diagnosis JSON. Conversation messages have cascading deletion. JSON is adequate for the initial flexible diagnosis schema; reporting can normalize selected fields later. SQLite uses foreign-key enforcement too.

One deployment must use one GitLab instance. Adding instance identity to project keys is required before supporting instance switching in the same database.

### No raw trace archive

Traces and CI files are transient. Saved analyses contain sanitized evidence, which may still be sensitive. Retention pruning runs on startup, history/detail reads and analysis creation; a low-traffic deployment may retain expired rows until the next such operation. Backups are outside that cleanup. Explicit deletion removes the diagnosis and its messages.

### Stateless API process; no distributed work queue yet

Async HTTPX/LangChain calls have explicit timeouts. A process-local semaphore permits two active AI-related requests, rejecting extra requests rather than creating an unbounded queue. Persistence uses short synchronous SQLAlchemy calls; this is appropriate for the local MVP, not a scalability claim. Production should introduce a worker queue, distributed limits and async DB access or offloading before increasing load.

## Kubernetes evolution (not deployed)

The frontend and API are separately built images; state lives in PostgreSQL, not a container filesystem. A migration runs as a Compose one-shot service, which maps naturally to a Kubernetes Job. `/health` can be used as a readiness probe; it checks DB connectivity, not GitLab/LLM availability. A separate lightweight liveness endpoint should precede production orchestration to avoid restart storms on database failure.

Before shipping manifests: add OIDC/SSO, ingress TLS, secret-store integration, a non-root nginx runtime, read-only root filesystems, resource/egress limits, network policies, structured metrics/tracing without prompt capture, backups, a durable queue and retention scheduling. No placeholder Kubernetes manifests pretend these requirements are already solved.

## External API limitations

Projects/pipelines are paginated. Pipeline jobs are collected over at most 20 pages of 100; larger pipelines return an explicit error. Root `.gitlab-ci.yml` is loaded at the pipeline SHA, but GitLab includes, custom config paths and child pipeline traversal are not resolved. Traces use bounded streaming and reject payloads over 2 MB. GitLab connection checks confirm token/API access, not that an LLM works or every repository file is readable.
