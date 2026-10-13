# pequeverso-assistant-backoffice

Private operations backoffice of the Pequeverso shopping assistant: OAuth sign-in for the owner
and invited people, access management, and a dashboard of the assistant's health, catalog
freshness, runs, latency, tokens and spend. The public conversation lives only in the storefront
(`pequeverso`); the former chat shells were removed from this repository (see git history).

The repository is public; the application is private. All rights reserved (see `LICENSE`).
**Status:** the compact availability and telemetry dashboard is a release candidate. Local
static/build and database checks pass; the full local browser run has two deadline failures
that remain visible in [verification](docs/verification.md). Final exact-image acceptance and
complete remote CI are required before merging this candidate. Earlier released image drills
are historical evidence, not proof of this candidate. This project has not deployed the
backoffice; real OAuth, infrastructure, capacity and model behavior need separate acceptance.
The dashboard never enables the storefront.

`Next.js 16 · Active LTS` `Node24 · LTS` `PostgreSQL18.6 · supported to2030`
`React19` `TypeScript7` `Better Auth` `Tailwind4` `OpenTelemetry` `Prometheus/Grafana handoff`

## Rendered dashboard gallery

These are native-resolution screenshots of the actual local production build, captured at
2× device scale with desktop 1440×1000 and mobile 390×844 viewports. **Every image uses local
MOCK/fixture operations data and a fake OAuth provider.** They show the UI, not external OAuth,
a VPS deployment, production metrics, OpenAI availability or model quality. Unknown resource
values remain “No disponible”; reported token usage produces a calculated cost, not a
reconciled provider invoice. The historical daily budget is explicitly labelled with its day.
The synthetic API may report enabled; the storefront has its own assistant switch and stays
disabled in this release preparation.

Open each PNG for legible original pixels. Mobile overview/focus images show the first
viewport; daily/resource details show complete sections. Mobile table views disclose different
columns through actual horizontal scrolling. The [capture notes](docs/verification/compact-availability-2026-10-13/README.md)
record provenance and agent inspection; they do not claim human review.

| Actual rendered view | Light fixture | Dark fixture |
| --- | --- | --- |
| Complete desktop overview · local MOCK | ![Light local MOCK Complete desktop overview](docs/verification/compact-availability-2026-10-13/desktop-light-overview.png) | ![Dark local MOCK Complete desktop overview](docs/verification/compact-availability-2026-10-13/desktop-dark-overview.png) |
| Point-in-time availability and remaining budget · local MOCK | ![Light local MOCK Point-in-time availability and remaining budget](docs/verification/compact-availability-2026-10-13/desktop-light-availability-budget-overview.png) | ![Dark local MOCK Point-in-time availability and remaining budget](docs/verification/compact-availability-2026-10-13/desktop-dark-availability-budget-overview.png) |
| Catalog freshness and origin · local MOCK | ![Light local MOCK Catalog freshness and origin](docs/verification/compact-availability-2026-10-13/desktop-light-catalog.png) | ![Dark local MOCK Catalog freshness and origin](docs/verification/compact-availability-2026-10-13/desktop-dark-catalog.png) |
| Reported usage, estimated cost and reserved spend · local MOCK | ![Light local MOCK Reported usage, estimated cost and reserved spend](docs/verification/compact-availability-2026-10-13/desktop-light-budget.png) | ![Dark local MOCK Reported usage, estimated cost and reserved spend](docs/verification/compact-availability-2026-10-13/desktop-dark-budget.png) |
| 24-hour and 30-day outcomes, latency, tokens and failures · local MOCK | ![Light local MOCK 24-hour and 30-day outcomes, latency, tokens and failures](docs/verification/compact-availability-2026-10-13/desktop-light-quality-latency-errors-tokens.png) | ![Dark local MOCK 24-hour and 30-day outcomes, latency, tokens and failures](docs/verification/compact-availability-2026-10-13/desktop-dark-quality-latency-errors-tokens.png) |
| Daily charts and accessible table · local MOCK | ![Light local MOCK Daily charts and accessible table](docs/verification/compact-availability-2026-10-13/desktop-light-daily-history.png) | ![Dark local MOCK Daily charts and accessible table](docs/verification/compact-availability-2026-10-13/desktop-dark-daily-history.png) |
| Opaque synthetic recent-run identifiers · local MOCK | ![Light local MOCK Opaque synthetic recent-run identifiers](docs/verification/compact-availability-2026-10-13/desktop-light-recent-runs.png) | ![Dark local MOCK Opaque synthetic recent-run identifiers](docs/verification/compact-availability-2026-10-13/desktop-dark-recent-runs.png) |
| Resources, HTTP counters and trace diagnostics · local MOCK | ![Light local MOCK Resources, HTTP counters and trace diagnostics](docs/verification/compact-availability-2026-10-13/desktop-light-telemetry-resources.png) | ![Dark local MOCK Resources, HTTP counters and trace diagnostics](docs/verification/compact-availability-2026-10-13/desktop-dark-telemetry-resources.png) |
| Mobile first viewport · local MOCK | ![Light local MOCK Mobile first viewport](docs/verification/compact-availability-2026-10-13/mobile-light-overview.png) | ![Dark local MOCK Mobile first viewport](docs/verification/compact-availability-2026-10-13/mobile-dark-overview.png) |
| Mobile actual keyboard focus · local MOCK | ![Light local MOCK Mobile actual keyboard focus](docs/verification/compact-availability-2026-10-13/mobile-light-navigation-focus.png) | ![Dark local MOCK Mobile actual keyboard focus](docs/verification/compact-availability-2026-10-13/mobile-dark-navigation-focus.png) |
| Mobile complete daily activity, left table columns · local MOCK | ![Light local MOCK Mobile complete daily activity, left table columns](docs/verification/compact-availability-2026-10-13/mobile-light-daily-history.png) | ![Dark local MOCK Mobile complete daily activity, left table columns](docs/verification/compact-availability-2026-10-13/mobile-dark-daily-history.png) |
| Mobile actual horizontal scroll, right table columns · local MOCK | ![Light local MOCK Mobile actual horizontal scroll, right table columns](docs/verification/compact-availability-2026-10-13/mobile-light-daily-history-scroll-right.png) | ![Dark local MOCK Mobile actual horizontal scroll, right table columns](docs/verification/compact-availability-2026-10-13/mobile-dark-daily-history-scroll-right.png) |
| Mobile complete technical resources section · local MOCK | ![Light local MOCK Mobile complete technical resources section](docs/verification/compact-availability-2026-10-13/mobile-light-telemetry-resources.png) | ![Dark local MOCK Mobile complete technical resources section](docs/verification/compact-availability-2026-10-13/mobile-dark-telemetry-resources.png) |

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
  -p 127.0.0.1:55432:5432 postgres:18.6-trixie@sha256:885953109528ad3dfc90362b1a6f50a78620b5315be19f187753d267e484dc5b
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

Shared runtime/version acceptance: [runtime baseline](docs/runtime-baseline.md).
