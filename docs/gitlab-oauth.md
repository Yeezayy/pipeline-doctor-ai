# Personal GitLab account connection

## Simplified local account login: public client + PKCE

The public website is only a presentation/demo: **no GitLab login happens there**. Real accounts are connected in the locally running application, and their tokens remain in the local database.

To avoid configuration for every user, the **project maintainer** must first register a GitLab application once:

- Name: Pipeline Doctor AI
- **Confidential: disabled** (public OAuth client)
- Callback: `http://localhost:8080/api/auth/gitlab/callback`
- Scope: **`read_api` only**

The GitLab.com application is registered and its **public Application ID** is committed in `backend/app/core/gitlab-registration.json`. This file contains no secret and can be distributed with releases. Its `instance_url` binds that registration to one GitLab instance. A different self-managed instance needs its own registration.

The application must be a **public client**: the **Confidential** checkbox must be **unchecked**. A confidential application rejects the no-secret PKCE exchange with `invalid_client`; edit the application (or recreate it) with Confidential off. The Application ID is public; the client secret is never needed, requested or distributed.

Users can start the local account edition without creating a `.env` or personal token (Docker Compose 2.24+):

```bash
docker compose -f compose.yaml -f compose.local.yaml up --build -d
```

They open **http://localhost:8080**, click **Continue with GitLab**, and authorize on GitLab. The local backend exchanges the code using S256 PKCE and **no client secret**, including during refresh. The encryption key is generated privately on first start and reused from the `doctor-local-state` volume. Do not delete that volume if you want to retain readable encrypted credentials. Existing explicit `TOKEN_ENCRYPTION_KEY` values still take precedence. `OAUTH_KEY_FILE` selects the private file for non-Docker loopback deployments.

The default `docker compose up` remains a local simulated demo, not a silent real connection. The local account edition requires the registration above and a **public** GitLab application. Keep the fixed callback port/hostname or register the exact alternative callback. `localhost` and `127.0.0.1` are not interchangeable cookie origins.

**Verification status:** the authorization start is verified against GitLab.com (public client ID, S256 PKCE, exact callback, single-use state), and an invalid callback is rejected locally. A complete live sign-in still requires a person's own GitLab credentials and is not part of CI. If the token exchange returns `invalid_client`, the GitLab application is still confidential.

Live AI calls still require a provider configured by the local operator. GitLab browsing does not require an LLM key. This does not move pipeline processing or credentials to GitHub Pages.

### Permission scope and upgrading an existing authorization

Pipeline Doctor uses only GitLab's HTTP API: profile lookup (`GET /api/v4/user`), project discovery, pipelines, jobs, traces and the Repository Files API. It requests **`read_api` only**; separate `read_user` and `read_repository` scopes are unnecessary. It does not clone repositories using Git-over-HTTP or request write access. See GitLab's [OAuth scope descriptions](https://docs.gitlab.com/integration/oauth_provider/#view-all-authorized-applications) and [Repository Files API scopes](https://docs.gitlab.com/api/repository_files/#available-scopes-for-personal-access-tokens).

**This is not a per-project GitLab authorization.** `read_api` can read API resources accessible to the account, including projects not selected in Pipeline Doctor. The app discovers available projects, but pipeline, trace and CI-file routes require an explicitly connected project owned by the current user. This application-level check cannot constrain a stolen GitLab token.

Earlier releases requested `read_user read_api read_repository`. Updating the code or refreshing an existing token does **not** automatically narrow an existing grant:

1. The maintainer edits the registered GitLab application so only **`read_api`** is enabled (keep **Confidential unchecked** for the local public client). This setting is managed in GitLab, not by this repository.
2. In GitLab **Edit profile → Access → Applications → Authorized applications**, revoke the previous **Pipeline Doctor AI** authorization. Revocation may affect other sessions of that application.
3. Restart the local app with the updated build and connect again to authorize the reduced scope. No personal token or client secret is needed.

## Alternative: confidential server application

The setup below remains available for an operator explicitly running a confidential server client. It is **not** a requirement for visitors of the public demo or for users of the pre-registered public local client. Leave `GITLAB_OAUTH_PUBLIC=false` for this alternative.

`AUTH_MODE=gitlab` gives each visitor their own GitLab login, projects and saved diagnoses. It is separate from the anonymous demo and shared-token local mode. An administrator registers the OAuth application once; visitors never paste personal access tokens.

## Register the application

On the chosen GitLab instance, open **Preferences → Applications** (`https://gitlab.com/-/user_settings/applications` on GitLab.com):

- Name: **Pipeline Doctor AI**
- Local Compose redirect: **`http://localhost:8080/api/auth/gitlab/callback`**
- Hosted redirect: **`https://YOUR-OWN-DOMAIN/api/auth/gitlab/callback`**, replacing the domain with the actual deployment
- Confidential: **enabled**
- Scope: **`read_api` only**

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
5. **Disconnect GitLab** ends this browser session and attempts to revoke its grant. If revocation is not confirmed, an alert survives the full-page redirect and reloads in the same tab, with a link to GitLab's applications page and manual-revocation instructions. Clear it only after checking/revoking access in GitLab; a later successful logout does not silently dismiss an earlier warning. Closing the tab clears this tab-local notice, not the GitLab authorization.

Access/refresh tokens never reach JavaScript. The browser receives a random opaque HttpOnly, SameSite=Lax session cookie, Secure on HTTPS. Mutations also require an exact Origin match and a session-bound CSRF token from the API.

## Ownership and migration

GitLab identity includes the instance and user ID. Every project/analysis read, list and mutation enforces ownership. Two users can independently connect the same project. Local-mode rows remain **unowned** and are never assigned to the first OAuth visitor; they stay inaccessible to OAuth accounts. Returning to local mode shows only unowned rows. A failed OAuth session never falls back to `GITLAB_TOKEN`.

Logout keeps private saved history for the next login with the same GitLab identity. Analysis deletion cascades to its conversation. Account deletion/export is not yet implemented in the UI. One GitLab instance per deployment remains the supported configuration; use a separate database for another instance.

## Lifecycle and operational boundaries

- Authorization code + S256 PKCE; ten-minute, one-use state bound to a separate browser cookie. State/session identifiers are hashed in the database. Tokens and PKCE verifiers are Fernet-encrypted.
- Expiring tokens refresh server-side. A short database lease prevents concurrent rotation across workers; another request receives a retryable 503. Invalid grants require reconnecting. A crash after upstream rotation but before saving can also require reconnecting: there is no cross-system exactly-once guarantee.
- Sessions expire after `SESSION_DAYS`. Expired states/sessions are pruned at startup, analysis retention operations and new login starts. Revocation failure does not prevent local logout; revoke the grant manually in GitLab's **Authorized applications** if necessary. Logout affects this session, not all devices.
- The logout API keeps its `204` response and reports `X-GitLab-Revocation: revoked`, `pending-manual-revocation` or `not-attempted`. Only `revoked` is treated as confirmed; absent/unknown headers also trigger the manual-check notice. The notice stores only a boolean in `sessionStorage`, not a token or account identity.
- Keep `TOKEN_ENCRYPTION_KEY` stable and backed up separately. Losing/changing it makes existing credentials unreadable and requires reconnecting. There is no automatic key rotation or KMS integration.
- Before public hosting: TLS, trusted proxy/host configuration, secret management, encrypted backups, reliable PostgreSQL, login/abuse controls, admission policy and **per-user LLM quotas**. The process-local semaphore is not a distributed quota. Never expose demo/shared-token mode with private data.
- nginx logs method, path without query string and status, excluding OAuth callback codes/state. Keep uvicorn's `--no-access-log` or equivalent redaction in your hosting platform.

Tests cover PKCE, state/browser binding, replay, expiry, refresh leases, encryption, CSRF, logout, bearer headers and two-user isolation. A real authorized login still requires operator-provided GitLab application credentials.
