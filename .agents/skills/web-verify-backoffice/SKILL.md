---
name: web-verify-backoffice
description: "Verify the pequeverso-assistant-backoffice app end to end: checks, database suite, browser suite with the fake identity provider, optional real-API reading, image smoke and screenshot review. Not for writing features."
---

# Verify the backoffice

Prerequisites: Docker (or another disposable PostgreSQL), Playwright browsers. If PostgreSQL is
not available, stop and report the database and browser suites as not run; do not substitute mocks.

1. `npm run check` (Biome, TypeScript 7, unit/contract/boundaries, file/docs/skills checks, build).
2. Start a disposable server, e.g. `docker run -d --rm --name bo-pg -e POSTGRES_USER=test
   -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17.6-alpine`, then
   `DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres npm run test:db`. Expect 0 schema
   differences and every integration test passing.
3. `TEST_DATABASE_URL=… npm run test:browser` (ports 3241, 8237, 8238 must be free). Expect all
   projects to pass, including axe and CSP-violation checks.
4. Optional real reading: run a **committed** API revision (`git archive <sha>`) with the fixture
   provider and `OPS_READ_TOKEN`, then `LIVE_OPS_URL=… LIVE_OPS_TOKEN=… npm run test:browser --
   live-ops.spec.ts`. Never use a paid provider or real keys.
5. Image: `docker build`, run `node scripts/db-migrate.ts` as a one-shot, then the server with
   `--read-only --tmpfs /tmp --tmpfs /app/.next/cache:uid=1000,gid=1000,mode=0700,size=32m
   --cap-drop ALL` and production-like variables; check `/healthz`, headers on `/ingresar` and the
   redirect from `/panel`.
6. Open the PNGs in `docs/verification/backoffice/` and judge them (layout, contrast, overflow,
   honest empty states). Record results and limits in `docs/verification.md`.

## Limits

Evidence to report: commands, counts, engines, API revision used, what was not verified (real
Google/GitHub OAuth, TLS cookies, deployment). This skill never authorizes merging or deploying.
