# pequeverso-assistant-web

Frontend of the Pequeverso shopping assistant: an advisory, read-only helper that answers questions
about the store's printable learning kits with grounded answers, product cards, sources and
follow-up suggestions — and leaves checkout to the store.

One conversation implementation, two shells:

- **`/embed`** — the primary customer experience, framed by the storefront's own launcher panel
  (compact and expanded desktop, near-full-screen mobile).
- **`/`** — a secondary standalone page for demos and testing, same components and logic.

Public repository; all rights reserved (see `LICENSE`). **Status:** local release candidate. Not
deployed; not yet integrated into the storefront; API contract pinned from a provisional snapshot.

## Quick start

```bash
nvm use && npm ci
npx playwright install --with-deps chromium firefox webkit
npm run build
npm run preview:fixture
```

- http://localhost:3210 — local storefront **harness** (cross-origin host, fixture only) with the
  embedded assistant: click "Asistente".
- http://localhost:3207 — standalone page.

Both use a deterministic **mock** of the API (`scripts/mock-api.ts`); no model is called. Type
"lento", "interrumpir", "falla", "ocupado", "expirar", "presupuesto", "largo", "enlaces" or
"comparar" to exercise states (mock test hooks only).

## Commands

| Command | Purpose |
|---|---|
| `npm run check` | Biome, TypeScript 7 typecheck, contract + unit + boundary tests, security/docs/skills checks, build |
| `npm run test:browser` | Playwright: embedded (through the harness) and standalone, Chromium/Firefox/WebKit + mobile |
| `npm run preview:fixture` | Serve the last build with the mock API and harness |
| `npm run dev` | Next dev server (:3201) |

Details, including which compiler each command uses: [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Architecture](docs/architecture.md) — layers, data flow, conversation rules, security model
- [Design system](docs/design-system.md) — tokens, typography, components, motion, layout
- [Embed integration](docs/embed-integration.md) — storefront handoff: iframe, protocol v1, headers, focus
- [Deployment contract](docs/deployment-contract.md) — vps-ops handoff: image, variables, health, routing
- [API contract](docs/api-contract.md) — pinned snapshot and refresh procedure
- [Verification](docs/verification.md) — acceptance matrix, test runs, measurements, screenshots
- [Dependencies](docs/dependencies.md) — Dependabot and the conservative auto-merge policy
- [Coordination](docs/coordination.md) — inspected reference revisions and adopted decisions
- [Decisions](docs/adr/) — architecture decision records

## Stack

Next.js 16.3.6 (App Router, standalone output), React 19.3, TypeScript 7.0.2 (strict, sole type
checker), Tailwind CSS 4.3 with owned shadcn-style primitives (CVA), lucide icons, Biome 2.5,
Playwright 1.63 + axe-core. Node 24.21.0.
