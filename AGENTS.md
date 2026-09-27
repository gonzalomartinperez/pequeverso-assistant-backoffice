# Repository guidelines — pequeverso-assistant-web

Frontend of the Pequeverso shopping assistant: **one** conversation implementation served in two
shells. `/embed` (inside the storefront's panel) is the primary customer surface; `/` is a
secondary demo/testing surface. Public repository; source visible, all rights reserved (see
`LICENSE`). Never commit secrets, private operations details or other repositories' internals.

- English for code, docs and commits. Customer copy is neutral Latin American Spanish with "tú",
  matching the storefront (`src/shared/i18n/copy.ts`).
- Node from `.nvmrc` (24.21.0); restore with `npm ci`. Next.js 16 App Router, React 19, strict
  TypeScript 7 (the only type checker, also used by `next build`), Tailwind 4 with owned shadcn-style
  primitives, Biome.
- Read [docs/architecture.md](docs/architecture.md) before changing behavior and
  [docs/design-system.md](docs/design-system.md) before changing UI.

## Non-negotiables

- The assistant is advisory and read-only: no checkout, payment, order or cart features without a
  separately approved capability. Purchase actions link to the storefront's purchase section.
- Never display invented prices, ratings, discounts, stock, urgency or testimonials. Prices appear
  only when the API sends `price` (it omits unverified prices), always with its note and date.
- Treat API payloads, answer text, URLs and postMessage data as untrusted: validate at the adapter
  or protocol boundary; render answer text only through `RichTextView` (no HTML, no auto-linking);
  every URL passes `domain/links.ts`.
- No credentials, CSRF tokens or conversation text in URLs, storage, logs or postMessage. Never use
  `"*"` as a postMessage target.
- No tracking, analytics, session replay or third-party feedback services.
- Consume the pinned API contract (`contracts/api/`, `contracts/source.json`); do not invent
  endpoints, events or auth behavior. Mocks must say they are mocks.
- Architecture boundaries are enforced by `scripts/check-boundaries.ts` (run in `npm test`).
- Other repositories (storefront, API, portfolio, vps-ops) are read-only references. Never import
  from them at runtime or edit their working trees.

## Workflow

- Task branches from `develop` (`feat/`, `fix/`, `docs/`, `test/`, `ci/`, `chore/`, `build/`), PRs
  into `develop`. `main` receives only `develop` (release) or, **only with the owner's explicit
  authorization**, a `hotfix/*` branch that is then merged back into `develop`. The flow is a
  working agreement (no branch-policy automation); rulesets enforce PRs and Required checks.
  Nothing is deployed without explicit owner authorization. Preserve
  other agents' uncommitted work; never reset or stash it.
- Before a PR: `npm run check` (lint, typecheck, unit + contract + boundaries, security, docs,
  skills, build) and `npm run test:browser`. Inspect real screenshots for UI changes, at embedded
  panel sizes through the harness — not only full-page `/embed`.
- The deterministic suite owns ports 3207 (proxy), 3208 (web), 3210 (harness), 8207 (mock API).
- Paid model calls, production actions, DNS and storefront changes need separate explicit authority.
- Skills live in `.agents/skills/` (canonical); `.claude/skills/` adapters point to them. A skill is
  a procedure, never an authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
