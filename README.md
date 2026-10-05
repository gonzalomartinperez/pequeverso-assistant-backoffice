# pequeverso-assistant-backoffice

Private operations backoffice of the Pequeverso shopping assistant: OAuth sign-in for the owner
and invited people, access management, and a dashboard of the assistant's health, catalog
freshness, runs, latency, tokens and spend. The public conversation lives only in the storefront
(`pequeverso`); the former chat shells were removed from this repository (see git history).

The repository is public; the application is private. All rights reserved (see `LICENSE`).
**Status:** not deployed. No OAuth apps, domain, database or image exist in any environment.

## Quick start (no real credentials)

```bash
nvm use && npm ci
npx playwright install --with-deps chromium firefox webkit
docker run -d --rm --name bo-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -p 127.0.0.1:55432:5432 postgres:17.6-alpine
npm run build
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres npm run preview:backoffice
```

Open http://localhost:3241/ingresar and choose "Proveedor de prueba": a local fake identity
provider signs you in as `owner@example.test`; the dashboard shows the **synthetic** fixture from
`scripts/mock-ops.ts`, clearly labelled. To read a real API instead, run
`pequeverso-assistant-api` with `OPS_READ_TOKEN` set and start the stack with `LIVE_OPS_URL` and
`LIVE_OPS_TOKEN` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Commands

| Command | Purpose |
|---|---|
| `npm run check` | Biome, TypeScript 7, unit/contract/boundary tests, file/docs/skills checks, build |
| `npm run test:db` | Schema drift check + PostgreSQL integration suite (`DATABASE_URL` or `TEST_DATABASE_URL`: a disposable server) |
| `npm run test:browser` | Playwright against the production build, real PostgreSQL, fake IdP, mock ops |
| `npm run db:migrate` | Apply `migrations/` to `DATABASE_URL` |

## Documentation

- [Architecture](docs/architecture.md) and decisions: [auth](docs/adr/005-backoffice-auth-better-auth.md),
  [IAM in PostgreSQL](docs/adr/006-iam-in-postgresql.md), [ops data](docs/adr/007-ops-data-source.md)
- [Deployment contract](docs/deployment-contract.md) — vps-ops handoff: image, PostgreSQL, secrets, routing
- [Verification](docs/verification.md) — what ran, what it proves, screenshots, limits
- [Design system](docs/design-system.md), [dependencies](docs/dependencies.md), [security](SECURITY.md)

## Stack

Next.js 16.3.6 (App Router, standalone), React 19.3, TypeScript 7.0.2, Better Auth 1.7.7,
PostgreSQL (`pg` 8.23), Recharts 3.10, Tailwind CSS 4.3 with owned primitives, lucide icons,
Biome 2.5, Playwright 1.63 + axe-core. Node 24.21.0.
