# Security policy and deployment boundary

## Supported use

The GitHub Pages build is a backend-free presentation with only simulated fixtures and tab-memory examples. It has no real GitLab login, provider calls, token fields or server persistence. Real account access belongs to the local installation. The optional public-client PKCE mode uses a maintainer-registered public application ID, no client secret, and automatically generated private local encryption state. The maintainer ID is currently unset; this is not an activated login service.

Compose publishes only loopback ports. Anonymous demo and shared-token `AUTH_MODE=local` are single-operator modes and must not be exposed on untrusted networks. `APP_API_KEY` is not a multi-user security model. `AUTH_MODE=gitlab` adds OAuth sessions and per-user ownership, but still requires the [public-hosting prerequisites](docs/gitlab-oauth.md). Do not publish secrets in issues.

## Data handling

- OAuth tokens are Fernet-encrypted in PostgreSQL. Session/state identifiers are hashed; the browser receives only an opaque HttpOnly, SameSite=Lax cookie, Secure on HTTPS. State is single-use and browser-bound; PKCE uses S256. Mutations require an exact Origin match and session-bound CSRF token. A database lease coordinates refresh rotation. Local logout attempts upstream revocation but does not delete private saved history. See the OAuth guide for key loss, cleanup and account-deletion limitations.

- LLM credentials, OAuth application secrets and the optional shared GitLab token are backend environment values. Per-session GitLab OAuth tokens are encrypted in the database, not environment variables. The UI shows configuration booleans and the signed-in username, never credentials. No GitLab token input exists in the browser.
- HTTPX uses a private-token header, certificate verification and bounded timeouts; it does not follow redirects that could forward credentials. Administrator-configured service URLs cannot contain embedded credentials/query/fragment.
- Text redaction removes configured credentials and common secret forms before model calls, trace responses, user message storage and structured result persistence. It is heuristic. Inspect/sanitize CI output at the source. Neither personal data nor all encoded/unlabeled secrets are guaranteed to be removed.
- Third-party LLM calls transmit sanitized excerpts and context to the configured provider. Check your organization's permissions and the provider's retention policy before using real logs. Do not enable LangChain/LangSmith prompt tracing unless explicitly approved.
- No raw trace/CI file archive is stored. Sanitized evidence, names, branch/commit IDs, diagnostic JSON and conversations are stored for `RETENTION_DAYS`. Cleanup runs at startup and analysis read/create operations, not on an independent timer. Individual deletion cascades to conversations. Operators must expire backups independently.

## AI trust boundary

Logs, files and user context are untrusted model data. A system instruction rejects embedded directives; evidence quotes are checked against the actual supplied excerpts. This is defense in depth, not a guarantee against prompt injection or hallucinations. The model has no shell, write, retry or MR tools. Recommendations are rendered as text, not raw HTML/Markdown executable content. Fixes cannot be marked tested. Never paste credentials into chat.

## Abuse/cost boundary

Two AI requests are allowed per API process. Trace payloads over 2 MB are rejected; prompt portions and conversation windows are limited. These are local safeguards, not distributed rate limits, token-accurate billing limits or tenant quotas. A publicly reachable unauthenticated API could spend your provider budget: keep loopback bindings and add proper authentication before any remote deployment.

## Reporting

Report non-sensitive reproduction details through a GitHub issue. For vulnerabilities involving credentials or private data, use GitHub's private vulnerability reporting if enabled, or contact the maintainer privately through their GitHub profile. Do not include real traces, tokens, `.env` files or personal data. No claim is made that the project has undergone an independent security audit.
