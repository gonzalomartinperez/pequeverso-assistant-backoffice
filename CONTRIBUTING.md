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

## Branch flow and protection

`main` is the default branch (released code); `develop` is the integration branch. The flow is a
working agreement we follow ourselves; GitHub enforces only the safety net, with the same rulesets
as the other Pequeverso and portfolio repositories (`protect-main`, `protect-develop`, **no bypass
actors**):

- changes arrive only through pull requests, merged with a **merge commit** (squash and rebase are
  disabled) so ancestry between the long-lived branches is preserved;
- the aggregate **Required checks** job (workflow lint, history secret scan, static checks, the
  database suite when `test:db` exists, the production image and the browser suite against that
  image, in three shards) must pass on a branch that is up to date with its base (strict);
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
