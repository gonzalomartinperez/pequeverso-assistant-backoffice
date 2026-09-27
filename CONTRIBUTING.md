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

`main` is the default branch (released code); `develop` is the integration branch. Both are
protected by repository rulesets (`protect-main`, `protect-develop`) with **no bypass actors**:

- changes arrive only through pull requests, merged with a **merge commit** (squash and rebase are
  disabled) so ancestry between the long-lived branches is preserved;
- the aggregate **Required checks** job (GitHub Actions) must pass on a branch that is up to date
  with its base (strict); it depends on static checks, the production image and the browser suite
  against that image;
- into `main`, the **Release source** check (`.github/workflows/release-flow.yml`, run from the base
  branch so a pull request cannot alter it) allows only `develop`, or a `hotfix/*` branch that the
  repository owner has approved (see below);
- force-pushes and deletion of `main`/`develop` are blocked; review threads must be resolved.

### Hotfixes (owner authorization only)

A hotfix may go directly into `main` only with the owner's explicit authorization:

1. Branch `hotfix/<short-name>` from `main`, fix, and open a pull request into `main`.
2. The owner reviews it and applies the label **`hotfix-approved`**. Release source verifies through
   the API that the label was applied by the repository owner **after the latest push**; a label from
   anyone else, or new commits after the approval, fail the check until the owner re-applies it.
3. Required checks must still pass; merge with a merge commit.
4. Immediately open a pull request from `main` into `develop` (Release source only restricts pull
   requests into `main`) and merge it, so both branches stay in sync.

No approving review is required: the repository has a single maintainer and GitHub does not let an
author approve their own pull request. If a second maintainer joins, raise
`required_approving_review_count` in both rulesets. Task branches are deleted automatically after
merge; at rest only `main` and `develop` exist.
