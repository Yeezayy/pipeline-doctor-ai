# Security policy and deployment boundary

## Supported use

This MVP is for a single operator on a local development machine. Compose publishes only loopback ports. Do not expose the application/API publicly or port-forward it onto an untrusted network. `APP_API_KEY` is an optional shared local key, not a multi-user security model. Do not publish secrets in GitHub issues.

## Data handling

- GitLab/LLM credentials are environment values on the backend only. The UI shows configuration booleans, not values. No GitLab token input exists in the browser.
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
