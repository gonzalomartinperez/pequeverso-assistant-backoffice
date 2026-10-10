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
| `npm run dev` | Next dev server on :3201 (needs `DATABASE_URL` and the other variables in `.env.local`; prefer `npm run preview:backoffice`) |
| `npm run preview:backoffice` | Serves the last `npm run build` with a fresh PostgreSQL database, the fake IdP and the synthetic ops mock (`TEST_DATABASE_URL` required) on :3241 |
| `npm run build` | `next build --webpack`; type-checks with the project-local **TypeScript 7** `tsc` CLI (Next's default `useTypeScriptCli`) |
| `npm run typecheck` | `next typegen` (route types) then **TypeScript 7** `tsc --noEmit` over the whole project, tests included |
| `npm test` | `node --test` on `tests/unit/**/*.test.ts` (Node 24 strips types natively; no compiler involved): access rules, pinned ops contract, configuration, CSP, fixture safety and the architecture-boundary check |
| `npm run lint` / `npm run format` | Biome (lint + format); Biome does not type-check |
| `npm run check` | Everything above except browsers and databases |
| `npm run test:db` | `scripts/db-check.ts` (migrations vs Better Auth schema, idempotent re-apply) and `tests/integration` (real OAuth callback against `scripts/fake-idp.ts`); needs a disposable PostgreSQL in `DATABASE_URL` or `TEST_DATABASE_URL`; each run creates and drops its own databases |
| `npm run test:browser` | Playwright (`playwright.config.ts`) against the production build started by `scripts/backoffice-stack.ts`: ports 3241 (web), 8237 (mock ops), 8238 (fake IdP); needs `TEST_DATABASE_URL`. With `LIVE_OPS_URL`/`LIVE_OPS_TOKEN` it reads a running API instead of the mock (`live-ops.spec.ts`) |

No tool in this repository requires the TypeScript JavaScript compiler API (TypeScript 7 does
not provide it): the boundary checker scans imports without it, and Next uses the CLI checker.

## Pull requests

Branch from `develop`, keep changes focused, use Conventional Commits, and target `develop`.
Describe verification (commands, browsers, desktop, dark and mobile screenshots). See `AGENTS.md`.

## Branch flow and protection

`main` is the default branch (released code); `develop` is the integration branch. The flow is a
working agreement we follow ourselves; GitHub enforces only the safety net, with the same rulesets
as the other Pequeverso and portfolio repositories (`protect-main`, `protect-develop`, **no bypass
actors**):

- changes arrive only through pull requests, merged with a **merge commit** (squash and rebase are
  disabled) so ancestry between the long-lived branches is preserved;
- the aggregate **Required checks** job (workflow lint, history secret scan, static checks, the
  database suite, the hardened production-image smoke and the browser suite against a production
  build with real PostgreSQL and a fake IdP) must pass on a branch that is up to date with its base (strict);
- force-pushes and deletion of `main`/`develop` are blocked; review threads must be resolved.

Working agreement (not automated, to avoid friction):

- task branches `type/kebab-case` (`feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `ci`,
  `build`, `revert`) from `develop`, pull requests into `develop`;
- only `develop` is merged into `main` (a release);
- **hotfixes go directly into `main` only with the owner's explicit authorization**: branch
  `hotfix/<short-name>` from `main`, pull request into `main` with Required checks green, then merge
  `main` back into `develop` right away so both branches stay in sync.

No approving review is required: the repository has a single maintainer and GitHub does not let an
author approve their own pull request. If a second maintainer joins, raise
`required_approving_review_count` in both rulesets. Task branches are deleted automatically after
merge; at rest only `main` and `develop` exist.

## TypeScript style

The [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) is the
readability reference, adapted to React/Next.js and this toolchain:

- Named exports only, except where Next.js requires a default export (pages, layouts, `proxy`).
- File names in kebab-case; React components in PascalCase; route folders follow the URL (Spanish).
- `type` aliases for data shapes and unions (discriminated unions for states and results);
  `interface` for ports implemented by adapters. No `enum` and no parameter properties
  (`erasableSyntaxOnly`); classes only for stateful adapters.
- No `any`; `unknown` at boundaries, then runtime validation (`adapters/validate.ts`). Typed
  dictionaries (`Record<Union, …>`) instead of string-keyed objects.
- Relative imports inside a feature carry the `.ts` extension so Node can run sources directly;
  `@/` aliases are used by routes and React modules resolved by Next.js.
- Comments explain why and invariants, not what the code does. Biome formats (100 columns).
- `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` stay on.
