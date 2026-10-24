<div align="center">

# Pipeline Doctor AI
### AI-Powered GitLab CI/CD Troubleshooting

**Less firefighting. More shipping.**

An open-source investigation workbench that turns failed GitLab jobs into evidence-backed diagnoses — without handing an AI the keys to your infrastructure.

**Public website = landing + simulated demo. Real GitLab pipelines run in your local installation.** No GitLab account, backend or provider key is needed for the public demo. See [the public/local split](docs/public-site.md).

[![CI](https://github.com/Yeezayy/pipeline-doctor-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Yeezayy/pipeline-doctor-ai/actions/workflows/ci.yml)
![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
[![MIT License](https://img.shields.io/badge/License-MIT-a8e1bf)](LICENSE)

[Quick start](#quick-start) · [Live integration](#connect-a-real-gitlab-project) · [Architecture](docs/architecture.md) · [Security](SECURITY.md) · [Roadmap](#roadmap)

[Public demo](https://yeezayy.github.io/pipeline-doctor-ai/)

</div>

![Public SaaS landing — product preview uses explicitly simulated data](docs/screenshots/landing.png)

[View the demo dashboard](docs/screenshots/dashboard.png) · [View a diagnosis](docs/screenshots/diagnosis.png)

## Why this exists

A red pipeline rarely explains itself. The important line is buried in runner noise, the job image changed three commits ago, and “retry” is not a diagnosis. Pipeline Doctor puts the job trace, a structured explanation and a contextual assistant in one focused workspace.

This is a **functional, local-development MVP**, not an autonomous repair agent or a hosted multi-tenant service. Demo data is always labeled. Live integrations require your own GitLab and LLM credentials.

## What works today

- **GitLab connection:** discover accessible member projects, connect a project, browse paginated pipelines, inspect details and jobs, fetch traces and the root `.gitlab-ci.yml` at the pipeline's immutable commit.
- **Personal accounts:** GitLab OAuth + PKCE, encrypted server-side tokens, HttpOnly sessions, CSRF protection and per-user ownership. Operator registration is required: [OAuth guide](docs/gitlab-oauth.md).
- **Public landing:** a SaaS-style presentation, actual demo captures and entry points to the workbench or account login. The dashboard lives at `/dashboard`.
- **Interactive 3D:** a Three.js pipeline illustration built with React Three Fiber and Drei. Select stages, orbit and pause motion. It is illustrative, not live GitLab data. The renderer is lazy-loaded, motion stops off-screen/in background tabs, reduced motion is respected, and an accessible fallback works without WebGL.
- **Structured AI diagnosis:** probable root cause, severity, confidence estimate, exact evidence excerpts, hypotheses, explanation and recommended fixes, validated with Pydantic through LangChain.
- **Contextual chat:** follow-up questions using the selected diagnosis, pipeline metadata and recent conversation; no claim of access to the full original trace.
- **History:** persistent analyses and conversations, individual deletion and configurable retention.
- **Focused UI:** responsive dark workbench, project switching, pipeline status filters, current-page search by branch/commit/pipeline ID, loading/error/empty states and explicit demo/live labels.
- **Shareable log excerpts:** copy exactly the sanitized trace displayed in the workbench, with explicit feedback when clipboard access is unavailable. Masking is best effort; review the excerpt before sharing it.
- **Local safety defaults:** server-side credentials, secret masking, log budgets, optional application API key, loopback-only published ports and no automatic execution or repository writes.
- **Reproducible demo:** six curated incidents, deterministic example diagnoses and explicitly fixed example chat replies. No GitLab account or paid API required.

![Diagnosis with exact evidence and contextual assistant — simulated demo](docs/screenshots/diagnosis.png)

## Quick start

### Docker Compose — recommended

Requirements: Git, Docker Engine/Desktop running, Docker Compose v2.

```bash
git clone https://github.com/Yeezayy/pipeline-doctor-ai.git
cd pipeline-doctor-ai
cp .env.example .env
docker compose up --build -d
```

- App: **http://localhost:8080**
- API docs: **http://localhost:8000/docs**
- Health: **http://localhost:8000/health** (includes a database connectivity check)

Compose waits for PostgreSQL, runs a one-shot Alembic migration, then starts the API and nginx frontend. The database is not published on a host port. All published application ports bind to `127.0.0.1`.

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

`down` preserves the PostgreSQL volume. Do not delete it unless you intend to erase saved analyses. If port 8000 is occupied, use `BACKEND_PORT=8001 docker compose up --build -d`; the frontend proxy does not change.

### Without Docker — fastest contribution loop

Requirements: [uv](https://docs.astral.sh/uv/), Python 3.12+, Node.js 24 LTS and npm. SQLite is an intentional **local-development fallback**; PostgreSQL is the Compose/CI database.

Terminal 1, from the repository root:

```bash
cd backend
uv sync --frozen --python 3.12
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
```

Terminal 2, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` and `/health` to the local backend. The root `.env` belongs to Compose; for a non-Docker backend, export environment variables or create an ignored `backend/.env`. Its defaults are demo mode and `sqlite:///./doctor.db`. Run Alembic against the same `DATABASE_URL` used by the API.

## Try the demo

1. Leave `DEMO_MODE=true` (the default).
2. Open **Pipelines** and inspect pipeline **#1048**.
3. Review the simulated Docker job trace, then click **Diagnose this job**.
4. Read the observed evidence, probable cause and untested recommendations.
5. Ask a follow-up in **Ask Doctor**. Demo replies explicitly say that they are fixed examples, not generated answers.
6. Reopen the saved diagnosis from **Analysis history**, or delete it.

The six incidents are Dockerfile not found, TypeScript compilation failure, missing Python dependency, YAML syntax error, registry authentication failure and an unsuitable job image. Three successful runs complete the sample. History starts empty; no analyses are silently pre-generated. Screenshots show demo analyses created through the real UI/API.

Demo and live projects/analyses are isolated by source. Switching modes never silently turns fixtures into live results. A YAML parser error is represented as a simulated validation job; actual invalid GitLab configurations may create no runnable jobs, which the UI handles as an empty state.

## Connect a real GitLab project

**The intended user-friendly local flow is public OAuth + PKCE:** users run the app locally and authorize their own GitLab account, with no personal token or client secret to paste. The maintainer must first register and distribute the public Application ID; it is currently unset. See [the exact maintainer and user steps](docs/gitlab-oauth.md#simplified-local-account-login-public-client--pkce). The static website is never involved in real GitLab authentication.

For an operator deliberately choosing a confidential OAuth client, the alternative [server setup](docs/gitlab-oauth.md#alternative-confidential-server-application) still exists. It is not needed by public demo visitors. The instructions below describe the separate **local-only shared-token mode** (`AUTH_MODE=local`).

1. Create a **read-only** personal or project access token with `read_api` and appropriate project membership. Depending on your GitLab version/token type, repository file reads may additionally require `read_repository`. Do not grant write access.
2. Edit the server environment, never frontend variables:

```dotenv
DEMO_MODE=false
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=
GITLAB_PROJECT_ID=
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
APP_API_KEY=
```

Fill the empty values locally, **never commit them**. `GITLAB_PROJECT_ID` is optional: a numeric ID or `group/project` path auto-connects when no live project is connected. Otherwise use **Settings → Connect a project**. `GITLAB_URL` can point to your self-managed instance, including an installation subpath. TLS certificates must be trusted; verification is never disabled.

3. Configure an OpenAI or OpenAI-compatible provider. The chosen model must support **structured JSON-schema output** through LangChain's `ChatOpenAI.with_structured_output`. Provider compatibility is not universal. The model name is configurable; the default is not a claim that it is the newest or best model.
4. Apply environment changes: `docker compose up -d --force-recreate backend`. In local development, restart the API with the new environment.
5. Test GitLab connectivity in Settings, connect a project, select a failed job and request a diagnosis.

GitLab browsing works without an LLM key; live analysis/chat returns an explicit configuration error until a provider is configured. Failed GitLab calls are never replaced with demo data. Root CI files missing or forbidden are treated as unavailable. HTTP errors, malformed lists, permissions, rate limits and timeouts have explicit error responses.

### Configuration reference

All variables in `.env.example` are backend/Compose configuration; no provider secrets are embedded in the browser bundle.

- `DEMO_MODE`: default `true`; explicit fixtures vs live requests.
- `DATABASE_URL`: SQLAlchemy URL. Compose uses `postgresql+psycopg://…`; local fallback is SQLite.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: Compose database bootstrap values. Update `DATABASE_URL` consistently. Supplied values are development defaults, not production credentials.
- `GITLAB_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_ID`: GitLab instance, read-only token and optional initial project.
- `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`: compatible provider configuration.
- `APP_API_KEY`: optional shared local API protection. When set, enter it in **Settings → Local API access**. Only this application key is kept in tab-scoped `sessionStorage`.
- `AUTH_MODE`: `local` (default) or `gitlab` (per-user OAuth, requiring `DEMO_MODE=false`). OAuth never falls back to the shared token.
- `PUBLIC_APP_URL`: exact browser-facing origin, determining the callback and allowed mutation Origin.
- `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`: explicit confidential-client configuration; the public local PKCE mode does not require a client secret and can generate its own private encryption key. Only a public application ID may be distributed; keys and client secrets must never be put in frontend variables.
- `GITLAB_OAUTH_PUBLIC`: when true, public PKCE sends no client secret and can load the maintainer's public registration ID from `app/core/gitlab-registration.json`. On loopback, the encryption key can be generated privately in `OAUTH_KEY_FILE`; `compose.local.yaml` persists it in a private named volume. Confidential server mode retains the explicit-secret/key requirements above.
- `SESSION_DAYS`: browser session lifetime, default `7`; access tokens refresh independently.
- `CORS_ORIGINS`: JSON array; defaults to the two local Vite origins. Compose uses same-origin nginx proxying.
- `RETENTION_DAYS`: default `30`, range `1–365`.
- `LOG_MAX_CHARS`: default `16000`, range `1000–64000`; redacted head/tail excerpt. CI config has a separate 8000-character budget; user context is limited to 4000 characters.
- `BACKEND_PORT`: optional Compose host port override, default `8000`.

## Architecture

```mermaid
flowchart LR
  User[Developer] --> UI[React workbench / nginx]
  UI --> API[FastAPI routes]
  API --> Services[Pipeline & analysis services]
  Services --> GitLab[HTTPX GitLab API client]
  GitLab --> Instance[GitLab.com or self-managed]
  Services --> Mask[Secret masking & excerpt budgets]
  Mask --> Chain[LangChain + Pydantic schema]
  Chain --> LLM[OpenAI-compatible provider]
  Services --> DB[(PostgreSQL)]
  Services -. explicit demo mode .-> Fixtures[Curated simulated incidents]
```

Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, a shadcn-style Radix/CVA Button, TanStack Query, React Router, Lucide, Three.js, React Three Fiber and Drei. Backend: Python 3.12+, FastAPI, Pydantic v2, LangChain, SQLAlchemy, Alembic, HTTPX and cryptography/Fernet for OAuth credentials. Infrastructure: PostgreSQL 17, Docker Compose, nginx and GitHub Actions. Both dependency lockfiles are committed. There is no unnecessary multi-agent layer, vector database or fake background job system.

The 3D renderer is a separate lazy chunk (roughly 254 KB gzip with the current lockfile), not part of the initial application bundle. Vite reports its size as a warning. The page remains functional without WebGL; the canvas pauses when hidden and caps rendering pixel ratio at 1.5. Chromium tests exercise a real software WebGL renderer and the non-WebGL fallback.

See [architecture decisions and tradeoffs](docs/architecture.md) and [security/data policy](SECURITY.md).

## Quality checks

For the backend-free public site, run `VITE_BASE_PATH=/pipeline-doctor-ai/ npm run build:public` and `npm run test:public` from `frontend/`. The dedicated Pages workflow publishes only this build after its browser checks. Domain setup is described in [docs/public-site.md](docs/public-site.md).

```bash
cd backend
uv sync --frozen --python 3.12
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```

```bash
cd frontend
npm ci
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests require the demo API running on `127.0.0.1:8000`, with Alembic applied. Playwright starts Vite automatically (or reuses it locally). Tests cover schema bounds, masked secrets, GitLab mocked HTTP responses, timeouts, trace size caps, health, optional authentication, six demo incidents, mocked live diagnosis/chat, source isolation, deletion/retention, migration upgrade/downgrade and desktop/mobile browser flows. No real GitLab/LLM token is needed.

To test Compose directly, run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:e2e` from `frontend/`. OAuth has mocked flow/security/isolation tests and a browser redirect test; a live login requires your registered application.

CI runs Ruff, the backend suite against PostgreSQL (plus a SQLite migration test), migration drift checks, TypeScript, production build and Chromium end-to-end tests. Never point `TEST_DATABASE_URL` at a database you want to keep: **the test suite drops application tables**.

## Safety and limitations

- **Deployment boundary:** demo/shared-token mode must stay local. OAuth adds real sessions and ownership checks, but public hosting still needs TLS, admission/abuse controls, per-user LLM quotas and a deployment review. Compose still binds only loopback ports. See [OAuth deployment requirements](docs/gitlab-oauth.md).
- Masking covers configured credentials, common assignments, credential URLs, bearer/basic values, common token prefixes, AWS access key IDs, JWTs and PEM private keys. It is **best effort**, not a guarantee. Unlabeled/encoded/fragmented secrets and personal data can remain. Use sanitized CI logs and a provider permitted by your organization's data policy.
- Only sanitized diagnostic evidence, pipeline metadata and conversations are persisted, **not raw traces or CI files**. Metadata/evidence can still be sensitive. Retention is enforced at startup and analysis read/create operations, not by a standalone scheduled cleanup service. Individual delete cascades to messages; database backups need their own expiry policy.
- Logs/files are untrusted. The model is instructed to ignore embedded instructions; evidence quotes are checked against supplied excerpts. This reduces risk but **does not solve prompt injection**. Confidence is not calibrated. All fixes remain explicitly untested.
- Traces over **2 MB are rejected** before analysis; smaller traces are masked and reduced to a head/tail excerpt. CI file reads have a 500 KB acceptance cap. Character budgets are not exact token accounting.
- One GitLab instance and one configured LLM provider per deployment. OAuth personal accounts are supported; streaming chat, job retries, automatic YAML changes, remote includes resolution, CI Lint and merge requests are not. Use a separate database when changing GitLab instances.
- Requests are synchronous HTTP operations with async external calls; two concurrent AI investigations per API process. No durable worker queue or distributed quota. Conversations are limited to 50 exchanges, with only the last 10 messages supplied to the model.
- Real integration code is tested with mocks; a live GitLab/provider smoke test requires your own authorized credentials. The demo does not prove a model's diagnostic accuracy.

## Roadmap

- **V1 — Functional MVP:** GitLab browsing, sanitized job traces, structured diagnosis, contextual chat, history, demo, Docker and CI.
- **V2 — AI Fix Assistant:** reviewable YAML diffs, GitLab CI Lint validation, approved merge requests and fix history.
- **V3 — Advanced DevOps:** webhooks, queued investigations, documentation/incident RAG, diagnostic evaluation metrics, monitoring, hardened Kubernetes deployment and possible GitHub Actions/Jenkins support.

Planned features are not claimed as implemented. Contributions welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Built as an engineering portfolio project with AI-assisted development; design tradeoffs, tests and limitations are documented rather than hidden behind feature claims.
