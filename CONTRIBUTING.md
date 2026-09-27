# Contributing

## Setup

```bash
nvm use            # Node 24.21.0 from .nvmrc
npm ci
npx playwright install --with-deps chromium firefox webkit
cp .env.example .env.local   # optional: local runtime values (never commit)
```

## Commands (and which compiler each uses)

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server on :3201 (needs an API on the same origin for conversations; prefer `preview:fixture`) |
| `npm run preview:fixture` | Builds nothing; serves the last `npm run build` behind the test proxy (:3207) with the mock API (:8207) and the storefront harness (:3210). Open http://localhost:3210 for the embedded experience, http://localhost:3207 for standalone |
| `npm run build` | `next build --webpack`; type-checks with the project-local **TypeScript 7** `tsc` CLI (Next's default `useTypeScriptCli`) |
| `npm run typecheck` | `next typegen` (route types) then **TypeScript 7** `tsc --noEmit` over the whole project, tests included |
| `npm test` | Contract snapshot check, then `node --test` on `tests/unit/**/*.test.ts` (Node 24 strips types natively; no compiler involved) including the architecture-boundary check |
| `npm run test:browser` | Playwright: Chromium, Firefox, WebKit desktop + mobile Chromium/WebKit (`@mobile` specs) against the deterministic stack |
| `npm run lint` / `npm run format` | Biome (lint + format); Biome does not type-check |
| `npm run check` | Everything above except browsers |

No tool in this repository requires the TypeScript JavaScript compiler API (TypeScript 7 does
not provide it): the boundary checker scans imports without it, and Next uses the CLI checker.

## Pull requests

Branch from `develop`, keep changes focused, use Conventional Commits, and target `develop`.
Describe verification (commands, browsers, screenshots at panel sizes). See `AGENTS.md`.
