# Public presentation vs local application

## Public website: static files only

The public build contains the SaaS landing, Three.js illustration and an explicitly simulated workbench. It needs **no API server, database, GitLab account, OAuth registration, LLM key or VPS**. It cannot manage real pipelines.

```bash
cd frontend
npm ci
VITE_BASE_PATH=/pipeline-doctor-ai/ npm run build:public
npm run test:public
```

`--mode public` loads the committed, non-secret `.env.public` flag. The UI uses an in-browser fixture adapter rather than `/api` requests. Real integration controls/password fields are replaced with local installation guidance. Analyses and fixed chat examples exist only in tab memory; reload clears them. Never enter private logs or credentials in the public demo.

Routes use hashes (`#/dashboard`, `#/pipelines/…`) so GitHub Pages can serve deep links without a backend or SPA rewrite. Asset paths support both repository subpaths and custom-domain roots. `npm run test:public` previews a project-subpath build on port 4173 and verifies assets, anchors, mobile layout, all six incidents, history reset and **zero external/API requests**.

## GitHub Pages deployment

`.github/workflows/pages.yml` builds and browser-tests the static demo, then deploys `frontend/dist`. It never deploys Python, PostgreSQL or `.env` files. Pages source must be **GitHub Actions**. The configured default address is:

**https://yeezayy.github.io/pipeline-doctor-ai/**

The configured address is **https://pipeline-doctor.jordybarrere.dev/** (custom domain). The repository project URL `https://yeezayy.github.io/pipeline-doctor-ai/` redirects to it. Check the repository's **Public website** workflow for the actual deployment status. A configured address is not proof that a deployment succeeded.

### Custom domain

The custom domain is set in **Repository Settings → Pages → Custom domain** to `pipeline-doctor.jordybarrere.dev`, with a registrar CNAME from `pipeline-doctor` to `yeezayy.github.io`. HTTPS is enforced. GitHub Pages supplies the certificate; no VPS is needed. The workflow uses Pages' reported base path so a custom domain builds at `/`, while the default project site builds at `/pipeline-doctor-ai/`.

For another subdomain, add the equivalent CNAME (not the repository path). Apex domains require GitHub Pages' current A/AAAA or supported ALIAS/ANAME configuration; follow GitHub's published DNS instructions rather than copying unverified IPs. Verify domain ownership and keep HTTPS enabled. The DNS record itself remains managed at the registrar, not by this repository.

## Local application: real GitLab access

The normal frontend build still talks to FastAPI. Tokens, logs, credentials and stored analyses remain in that installation. The public website is not an authentication relay and never receives local tokens.

For account login without asking every user to create tokens or secrets, see [local OAuth public + PKCE](gitlab-oauth.md#simplified-local-account-login-public-client--pkce). The GitLab.com public Application ID is registered and shipped in `backend/app/core/gitlab-registration.json`; it must be a public client (**Confidential unchecked**), and self-managed instances need their own registration. No client secret is embedded. The public demo does not require this registration.
