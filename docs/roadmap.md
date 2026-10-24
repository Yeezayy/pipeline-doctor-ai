# Delivery roadmap

This roadmap describes real next increments, not scheduled artificial activity. Commit dates reflect actual work; pushes are not automatically staged or delayed to manufacture a contribution graph.

## V1 — current foundation

- [x] GitLab project discovery/connection and paginated pipeline browsing
- [x] Pipeline details, failed jobs and sanitized job traces
- [x] Structured LangChain diagnosis with exact evidence checks
- [x] Contextual chat and persisted history/deletion
- [x] Six explicitly simulated incidents without API credentials
- [x] Responsive workbench, PostgreSQL/Alembic, Compose and token-free CI
- [ ] Authorized real-instance/provider smoke test and documented compatibility matrix
- [ ] Broader credential masking corpus and adversarial prompt evaluation
- [ ] Expand keyboard/screen-reader and visual regression coverage

## V2 — small, reviewable engineering increments

1. **Evaluation harness:** fixture-based evidence correctness and abstention checks, a provider comparison script with opt-in paid calls. Measure before increasing autonomy.
2. **Read-only YAML inspection:** resolve config paths/includes within bounded scope and expose missing context explicitly.
3. **Proposed diff:** generate a structured `.gitlab-ci.yml` suggestion, with no writes and a side-by-side human review.
4. **CI Lint validation:** validate approved candidate content against GitLab's official endpoint and preserve the result separately from model confidence.
5. **Approved MR creation:** require explicit confirmation, minimum write scopes, audit trail and idempotency. Never execute commands from logs/model output.

Each increment should contain working code, focused tests, documentation and a clear PR. No empty commits or backdated history are needed to explain this project well.

## V3 — production-shaped capabilities

- GitLab webhooks with signature/secret validation and replay protection
- Durable workers for investigations, distributed quotas and cost tracking
- Retrieval over approved docs and sanitized historical incidents
- Human-rated diagnostic accuracy and regression monitoring
- OIDC, authorization, tenant isolation, secure sessions and access auditing
- Metrics, telemetry redaction, automated retention and backup restore drills
- Hardened Kubernetes deployment after security prerequisites
- Evaluate GitHub Actions/Jenkins only after GitLab workflows are reliable

## A five-minute portfolio walkthrough

1. Launch Compose with no credentials. Explain why simulation is a separate source, not a network fallback.
2. Diagnose the Dockerfile incident, pointing to literal evidence and explicitly untested fixes.
3. Ask a follow-up. Explain the difference between a curated demo reply and a live model response.
4. Inspect history, delete a diagnosis and explain the retention/backups boundary.
5. Show mocked live integration tests, the Alembic migration and GitHub Actions results.
6. Discuss an honest limitation: masking is heuristic; prompt injection is not solved; public deployment needs real authentication.
