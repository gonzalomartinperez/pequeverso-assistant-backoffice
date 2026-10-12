# pequeverso-assistant-backoffice

Private operations backoffice of the Pequeverso shopping assistant: OAuth sign-in for the owner
and invited people, access management, and a dashboard of the assistant's health, catalog
freshness, runs, latency, tokens and spend. The public conversation lives only in the storefront
(`pequeverso`); the former chat shells were removed from this repository (see git history).

The repository is public; the application is private. All rights reserved (see `LICENSE`).
**Status:** application releases and local synthetic image/database drills are verified;
not deployed by this project. Real OAuth, infrastructure, capacity, published image digests
and model behavior require separate acceptance. The dashboard never enables the storefront.

`Next.js 16 · Active LTS` `Node24 · LTS` `PostgreSQL18.6 · supported to2030`
`React19` `TypeScript7` `Better Auth` `Tailwind4` `OpenTelemetry` `Prometheus/Grafana handoff`

## Architecture and data flow

```mermaid
flowchart LR
  Operator[Invited operator] --> Auth[Better Auth OAuth]
  Auth --> IAM[(Private PostgreSQL IAM)]
  Operator --> Guard[Server session and role guard]
  Guard --> Panel[Pequeverso dashboard]
  Panel --> Adapter[Bounded validated server adapter]
  Adapter -->|Private bearer| Summary[API summary1.2]
  Adapter -. optional same bearer .-> Telemetry[API telemetry1.0]
  Summary --> APIData[(API-owned SQLite aggregates)]
  Telemetry --> Process[Point-in-time process readings]
  BO[BO safe manual instrumentation] -. off by default .-> Collector[Private OTLP collector]
  Prom[Private Prometheus scrape] -. separate bearer .-> BO
  Prom --> Grafana[Grafana safe aggregate panels]
```

The public storefront sends conversations to the API directly. This backoffice serves no
chat and receives no conversation content, buyer data or provider keys. PostgreSQL owns
operator IAM only; API SQLite owns sessions, run history and spend. The dashboard explains
point-in-time readiness and business outcomes; Prometheus/Grafana supplies longer-lived
private observability when an operator provisions it. No uptime percentage is invented
from a single observation, process uptime or successful scrape.

```mermaid
sequenceDiagram
  actor Operator
  participant BO as Backoffice server
  participant PG as PostgreSQL IAM
  participant API as Private operations API
  Operator->>BO: Open protected panel (session cookie)
  BO->>PG: Re-read verified identity and role
  PG-->>BO: Invited owner or viewer
  par Summary (existing contract)
    BO->>API: GET summary, server-only bearer
    API-->>BO: Content-free business aggregates
  and Optional telemetry
    BO->>API: GET telemetry, same private bearer
    API-->>BO: Current sample or unavailable
  end
  BO->>BO: Validate both contracts independently
  BO-->>Operator: Honest values and fixture labels; no credentials
```

## Quick start (no real credentials)

```bash
nvm use && npm ci
npx playwright install --with-deps chromium firefox webkit
docker run -d --rm --name bo-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -p 127.0.0.1:55432:5432 postgres:18.6-bookworm@sha256:9551dd5bf356409a21b31248f49b33bba9bb1877365f3a7e933aecd9af3cf52d
npm run build
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres npm run preview:backoffice
```

Open http://localhost:3241/ingresar and choose "Proveedor de prueba": a local fake identity
provider signs you in as `owner@example.test`; the dashboard shows the **synthetic** fixture from
`scripts/mock-ops.ts`, clearly labelled. Its static numbers and startup-refreshed sample timestamps
are demonstration data, not live process measurements. To read a real API instead, run
`pequeverso-assistant-api` with `OPS_READ_TOKEN` set and start the stack with `LIVE_OPS_URL` and
`LIVE_OPS_TOKEN` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

The official PostgreSQL image above is an isolated local test server, not the final hardened
artifact or a deployment recipe. The initialized `postgres` database exists and the
synthetic `test` administrator can create the disposable databases used by the suites.
No real credentials or remote database are permitted. Stop only this own server after use:
`docker stop bo-pg`. For the reviewed non-root/read-only artifact, use
[PostgreSQL runtime](docs/postgresql-runtime.md) and its exact-image SQL backup/restore drill.

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
- [Availability and observability](docs/observability.md) — safe signals, optional exporters, private scrape and BO-only Grafana/alert proposals
- [Verification](docs/verification.md) — what ran, what it proves, screenshots, limits
- [Design system](docs/design-system.md), [dependencies](docs/dependencies.md), [security](SECURITY.md)

## Stack

Next.js 16.3.8 (App Router, standalone), React 19.3, TypeScript 7.0.2, Better Auth 1.7.7,
PostgreSQL (`pg` 8.23), Recharts 3.10, Tailwind CSS 4.3 with owned primitives, lucide icons,
Biome 2.5, Playwright 1.63 + axe-core. Node 24.21.0. Support classifications and exact versions are recorded in
[the runtime inventory](docs/dependencies.md#runtime-support-inventory-2026-10-12);
maintained libraries are not mislabeled LTS. No infrastructure stack is installed here.
