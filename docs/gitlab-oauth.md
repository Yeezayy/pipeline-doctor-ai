# Personal GitLab account connection

`AUTH_MODE=gitlab` gives each visitor their own GitLab login, projects and saved diagnoses. It is separate from the anonymous demo and shared-token local mode. An administrator registers the OAuth application once; visitors never paste personal access tokens.

## Register the application

On the chosen GitLab instance, open **Preferences → Applications** (`https://gitlab.com/-/user_settings/applications` on GitLab.com):

- Name: **Pipeline Doctor AI**
- Local Compose redirect: **`http://localhost:8080/api/auth/gitlab/callback`**
- Hosted redirect: **`https://YOUR-OWN-DOMAIN/api/auth/gitlab/callback`**, replacing the domain with the actual deployment
- Confidential: **enabled**
- Scopes: **`read_user`**, **`read_api`**, **`read_repository`** only

Save the Application ID and secret directly into the backend environment. Never publish them, send them to chat or put them in `VITE_*` variables. Write access is not requested.

## Configure the server

Generate a persistent encryption key locally, from `backend/` after `uv sync`:

```bash
uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Store the key privately in the ignored root `.env` or deployment secret manager:

```dotenv
DEMO_MODE=false
AUTH_MODE=gitlab
PUBLIC_APP_URL=http://localhost:8080
GITLAB_URL=https://gitlab.com
GITLAB_CLIENT_ID=
GITLAB_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=
SESSION_DAYS=7
GITLAB_TOKEN=
GITLAB_PROJECT_ID=
```

Fill the OAuth values with your own credentials and keep the existing `DATABASE_URL`. Configure `LLM_API_KEY` for live diagnosis/chat; GitLab browsing does not require an LLM key.

`PUBLIC_APP_URL` determines the callback and must match the application registration exactly, including scheme, hostname and port. `localhost` and `127.0.0.1` are not interchangeable. Hosted origins require HTTPS; HTTP is accepted only on loopback. For Vite, use `PUBLIC_APP_URL=http://127.0.0.1:5173` and register that exact origin's callback.

```bash
docker compose up --build -d
```

Compose applies migrations first. Without Docker, apply `uv run alembic upgrade head` and restart the API with the matching environment.

## Visitor experience

1. Visit the public landing and choose **Connect your GitLab**.
2. Click **Continue with GitLab** and review permissions on GitLab's site.
3. Return to Settings, showing the connected username.
4. Connect an accessible project and inspect its pipelines.
5. **Disconnect GitLab** ends this browser session and attempts to revoke its grant.

Access/refresh tokens never reach JavaScript. The browser receives a random opaque HttpOnly, SameSite=Lax session cookie, Secure on HTTPS. Mutations also require an exact Origin match and a session-bound CSRF token from the API.

## Ownership and migration

GitLab identity includes the instance and user ID. Every project/analysis read, list and mutation enforces ownership. Two users can independently connect the same project. Local-mode rows remain **unowned** and are never assigned to the first OAuth visitor; they stay inaccessible to OAuth accounts. Returning to local mode shows only unowned rows. A failed OAuth session never falls back to `GITLAB_TOKEN`.

Logout keeps private saved history for the next login with the same GitLab identity. Analysis deletion cascades to its conversation. Account deletion/export is not yet implemented in the UI. One GitLab instance per deployment remains the supported configuration; use a separate database for another instance.

## Lifecycle and operational boundaries

- Authorization code + S256 PKCE; ten-minute, one-use state bound to a separate browser cookie. State/session identifiers are hashed in the database. Tokens and PKCE verifiers are Fernet-encrypted.
- Expiring tokens refresh server-side. A short database lease prevents concurrent rotation across workers; another request receives a retryable 503. Invalid grants require reconnecting. A crash after upstream rotation but before saving can also require reconnecting: there is no cross-system exactly-once guarantee.
- Sessions expire after `SESSION_DAYS`. Expired states/sessions are pruned at startup, analysis retention operations and new login starts. Revocation failure does not prevent local logout; revoke the grant manually in GitLab's **Authorized applications** if necessary. Logout affects this session, not all devices.
- Keep `TOKEN_ENCRYPTION_KEY` stable and backed up separately. Losing/changing it makes existing credentials unreadable and requires reconnecting. There is no automatic key rotation or KMS integration.
- Before public hosting: TLS, trusted proxy/host configuration, secret management, encrypted backups, reliable PostgreSQL, login/abuse controls, admission policy and **per-user LLM quotas**. The process-local semaphore is not a distributed quota. Never expose demo/shared-token mode with private data.
- nginx logs method, path without query string and status, excluding OAuth callback codes/state. Keep uvicorn's `--no-access-log` or equivalent redaction in your hosting platform.

Tests cover PKCE, state/browser binding, replay, expiry, refresh leases, encryption, CSRF, logout, bearer headers and two-user isolation. A real authorized login still requires operator-provided GitLab application credentials.
