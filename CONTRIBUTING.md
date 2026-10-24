# Contributing

Start with the README's local setup. Keep changes small, tested and accurately described. The app must remain usable without external credentials in explicit demo mode.

Before opening a PR:

1. Run Ruff (lint + format), pytest, TypeScript and the frontend production build.
2. For UI/API flow changes, run Playwright with the demo backend.
3. Add a migration for schema changes; verify `alembic upgrade head` and `alembic check`.
4. Test GitLab/provider errors without making real external calls in CI.
5. Update docs/screenshots when behavior changes. Screenshots must clearly label simulated data.
6. Never commit `.env`, raw job traces, provider credentials or private pipeline metadata.

Use descriptive commits such as `feat(gitlab): support custom CI config paths` or `test(ai): reject invented evidence`. Dates and authorship should reflect the actual contribution. AI-assisted contributions are welcome; contributors remain responsible for understanding and verifying the code.

`TEST_DATABASE_URL` is for disposable databases only: backend fixtures drop/recreate application tables. Never use a development database containing data you want to retain.
