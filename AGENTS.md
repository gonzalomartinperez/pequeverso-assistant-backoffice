# Repository guidelines — pequeverso-assistant-web (backoffice)

Private operations backoffice of the Pequeverso assistant (target repository name
`pequeverso-assistant-backoffice`): OAuth sign-in, access management and an operations dashboard.
The public conversation lives only in the storefront; this repository serves no public chat.
Public repository; all rights reserved (see `LICENSE`). Never commit secrets,
private operations details or other repositories' internals.

- English for code, docs and commits. UI copy is neutral Spanish with "tú".
- Node from `.nvmrc` (24.21.0); restore with `npm ci`. Next.js 16 App Router, React 19, strict
  TypeScript 7, Tailwind 4 with owned primitives, Better Auth on PostgreSQL, Biome.
- Read [docs/architecture.md](docs/architecture.md) before changing behavior and
  [docs/design-system.md](docs/design-system.md) before changing UI.

## Backoffice rules

- Access only through Better Auth OAuth (Google, GitHub): no passwords, no public sign-up, no
  domain-based access, no implicit account linking. Admission rules live in
  `src/features/auth/application/access.ts`; never move them into UI code.
- Every page and server action re-checks the role server-side (`requireActor`). No credentials,
  sessions or tokens in `localStorage`, URLs (except the one-time invitation link) or logs.
- Operations data comes only from the API's private summary through `src/server/operations.ts`;
  validate it, show missing values as "No disponible", label fixture data as synthetic, and never
  display prompts, answers, buyer data, cookies or secrets.
- Schema changes are new files in `migrations/` (append-only); run `npm run test:db`.

## Non-negotiables

- Treat API payloads and anything from the network as untrusted: validate at the adapter boundary.
- No tracking, analytics, session replay or third-party feedback services.
- Consume only pinned, committed contracts (`contracts/ops/`, `contracts/ops/source.json`); do not
  invent endpoints, fields or auth behavior. Mocks and fixtures must say they are synthetic.
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
- Before a PR: `npm run check`, `npm run test:db` and `npm run test:browser`. Inspect the real
  screenshots in `docs/verification/backoffice/` for UI changes (desktop, dark, mobile).
- Browser suite ports: 3241 (web), 8237 (mock ops), 8238 (fake IdP).
- Paid model calls, production actions, DNS and storefront changes need separate explicit authority.
- Skills live in `.agents/skills/` (canonical); `.claude/skills/` adapters point to them. A skill is
  a procedure, never an authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
