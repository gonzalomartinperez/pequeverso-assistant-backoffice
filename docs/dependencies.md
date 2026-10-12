# Dependency updates and conservative auto-merge

Dependabot keeps dependencies current; a trusted policy decides which of its pull requests may be
merged **automatically after all required checks pass**. Everything else waits for a human.
Passing CI does not make an update safe by itself: automation is limited to updates whose risk is
low *and* whose behavior the suites exercise.

## What is automatic

A Dependabot pull request gets native auto-merge only when **all** of these hold (verified from
authenticated API metadata, never from the title, labels or branch name alone):

- author `dependabot[bot]` (type Bot), head branch in this repository, base branch `develop`;
- every commit authored by `dependabot[bot]` and committed by `dependabot[bot]` or GitHub;
- changed files limited to `package.json` and `package-lock.json`;
- `package.json` differs **only** in dependency version strings (no script, engine or other field
  changes, no added or removed packages);
- every updated package qualifies — a group is eligible only if all members are:

| Update | Packages |
|---|---|
| patch | `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@biomejs/biome`, `@axe-core/playwright`, `@types/node`, `@types/react`, `@types/react-dom` |
| minor | `lucide-react`, `clsx`, `@axe-core/playwright` |

Source of truth: `scripts/dependabot/policy.ts` (tested in `tests/unit/dependabot-policy.test.ts`).

## What needs review (and why)

| Change | Reason |
|---|---|
| Major, prerelease, downgrades, non-exact versions | Breaking or ambiguous by definition |
| 0.x minor bumps | Semver allows breaking changes in 0.x minors |
| `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `@playwright/test`, `server-only` (even patches) | Runtime, compiler, framework, styling or test-engine migrations |
| Anything not on the allowlists | Not explicitly approved |
| Lockfile-only updates (transitive) | Full impact cannot be established automatically |
| GitHub Actions and Docker base-image updates | Workflow/permission and OS changes |
| Extra files, script changes, human commits, forks, drafts | Unexpected scope or untrusted authorship |
| Wrong base branch (e.g. security updates against `main`) | Only `develop` receives automated merges |

## How the decision is applied

1. `.github/workflows/dependency-policy.yml` runs on `pull_request_target` (opened, synchronize,
   reopened, edited, ready_for_review, labeled, unlabeled) for Dependabot PRs. GitHub runs the
   workflow file from the default branch (`main`); it checks out `scripts/dependabot/` from `main`
   only and runs it with Node; the PR head is never checked
   out, installed or executed, and PR text is never interpolated into shell commands.
2. Eligible → `enablePullRequestAutoMerge` with `mergeMethod: MERGE` and
   `expectedHeadOid` = the evaluated head SHA. Not eligible → auto-merge is disabled if it was on.
   Labels `dependencies:auto-merge` / `dependencies:manual-review` only communicate the result.
3. GitHub merges only when the `protect-develop` ruleset is satisfied: **Required checks** (workflow
   lint, history secret scan, static checks, database suite, production image, browser suite against
   a production build with real PostgreSQL and a fake IdP) green on a head that is up to date with
   `develop` (strict). There is no bypass actor; the workflow never merges directly.
4. Any new push, rebase, base change, reopen or label change re-runs the policy, so a PR that stops
   qualifying loses auto-merge before its checks can finish.

Token: the workflow's `GITHUB_TOKEN` with `contents: write` and `pull-requests: write` for that job
only (required by the auto-merge mutation). No PAT and no secrets are used.

**Post-merge CI:** a merge performed through auto-merge is attributed to GitHub Actions' token, and
events created by `GITHUB_TOKEN` do not start new workflow runs, so the `push` run on `develop` does
not fire. The merged tree equals the tested, up-to-date PR head (strict checks), so nothing untested
lands.

## Keeping pull requests current

`rebase-strategy: auto` lets Dependabot rebase its PRs when `develop` moves or conflicts appear;
each rebase is a new head, which re-runs CI and the policy. Dependabot stops rebasing a PR once
someone else pushes to it (and the policy then requires review), and old or conflicted PRs may need
`@dependabot rebase` or closing. Cooldowns (7/7/30 days for patch/minor/major; 7 days for Actions and Docker) and grouping reduce
churn for routine updates; they do not delay security updates.

## Security updates

Dependabot raises security updates against the **default branch (`main`)**, not `target-branch`.
They are never auto-merged and must not be merged into `main` directly (only `develop` is
released into `main`). Re-target them for normal integration: `gh pr edit <number> --base develop` (or let the
next version update carry the fix). Alerts stay open until the fix reaches `main` through a release;
do not dismiss them to get around the flow.

## Operating it

- **Pause everything:** `gh variable set DEPENDABOT_AUTOMERGE --body off` (resume with `--body on`
  or delete the variable). Open PRs lose auto-merge on their next event.
- **Force review of one PR:** add the label `dependencies:hold`.
- **Recover from a bad update:** open a normal PR into `develop` that reverts the merge commit
  (`git revert -m 1 <merge-sha>`) and let CI verify it; never push to protected branches.
- **Change the policy:** edit `scripts/dependabot/policy.ts` and its tests in a normal PR. The new
  policy takes effect once it is released to `main` (both the workflow and its scripts come from
  the default branch).

## Live verification (2026-09-27)

As soon as the configuration reached `main`, Dependabot opened four real pull requests against
`develop`. The policy workflow ran on `pull_request_target` (from the default branch) for each and
correctly withheld auto-merge (label `dependencies:manual-review`):

| PR | Update | Policy reason | Human decision |
|---|---|---|---|
| #8 | `actions/download-artifact` 4.3.0 → 8.0.1 | workflow files changed | full CI green (artifact round trip) → merged |
| #9 | `actions/checkout` 4.4.0 → 7.0.1 | workflow files changed | full CI green → merged |
| #10 | `actions/upload-artifact` 4.6.2 → 7.0.1 | workflow files changed | full CI green → merged |
| #11 | Docker `node` 24.21.0 → 26.10.0 | Dockerfile changed | declined: runtime major outside the Node 24 LTS line; ignore rule added |
| #17 | `actions/setup-node` 4.4.0 → 7.0.0 | workflow files changed | full CI green → merged |

The positive path (an allowlisted npm patch receiving native auto-merge) has only been verified by
the deterministic tests so far; it will be observed live on the first such Dependabot PR.

## Activation prerequisites

- Dependabot reads `.github/dependabot.yml` from the **default branch (`main`)**: version updates
  start only after this configuration reaches `main` through the release flow.
- `pull_request_target` always runs workflow files from the **default branch** (`main`), whatever the
  PR's base; the policy scripts are checked out from `main` too. Policy changes therefore take effect
  only after a release reaches `main` (observed live: a workflow present only on `develop` did not
  run).
- Repository settings already in place: auto-merge allowed, merge commits only, branch deletion on
  merge, rulesets `protect-main` / `protect-develop` without bypass. The repository is public, so
  rulesets are available on the current plan.
- No approving review is required by the rulesets (single maintainer; GitHub forbids self-approval).
  If a required review is introduced later, unattended merges stop until a reviewer approves — the
  policy must not be replaced by bot approvals.

## Runtime support inventory (2026-10-12)

"LTS" is used only where the upstream publishes that policy; a maintained stable library
is not promoted to an invented LTS product. Application/infra owners must periodically
review security advisories, supported versions and exact new artifacts.

| Component | Project revision | Upstream support classification |
|---|---|---|
| Node / npm build tooling | Node24.21.0, bundled npm11.19.0 | [Node24 LTS](https://nodejs.org/en/about/previous-releases); npm has its own stable releases, not a separate guaranteed LTS window |
| Next.js | 16.3.8 | [16.x Active LTS](https://nextjs.org/support-policy); pinned patch, recheck security updates |
| PostgreSQL image/tools | 18.6-bookworm, immutable linux/amd64 manifest in Dockerfile.postgres | [Supported major18 until2030-11-14](https://www.postgresql.org/support/versioning/); current stable minor18.6, not an upstream product called LTS |
| Debian runtime | bookworm slim + exact signed packages | [Debian LTS](https://www.debian.org/lts/), architecture/package coverage varies; residual CVEs remain activation decisions |
| React / React DOM |19.3.0 | [Stable React19](https://react.dev/versions); no published separate LTS guarantee |
| Better Auth |1.7.7 | [Stable upstream](https://www.better-auth.com/docs/introduction); pinned and OAuth/schema regression tested, no invented LTS |
| pg |8.23.1 | [Maintained stable](https://node-postgres.com/); no LTS window advertised |
| OpenTelemetry JS |API1.9.1,resources/traceSDK2.12.0,OTLPHTTP0.223.0 | [Official API/SDK signal stability](https://opentelemetry.io/docs/languages/js/); exporter0.x release line is experimental semver, not LTS; manual bounded usage explicitly reviewed |
| TypeScript |7.0.2 | [Stable compiler releases](https://www.typescriptlang.org/docs/); no separate LTS policy |
| Tailwind/PostCSS |4.3.3 | [Stable tooling](https://tailwindcss.com/docs); no separate LTS policy |
| Playwright / axe |1.63.0 /4.13.0 | [Stable Playwright](https://playwright.dev/docs/release-notes) and [axe](https://github.com/dequelabs/axe-core/releases); test-only, no invented LTS |
| Biome |2.5.15 (one compatible patch above the2.5.14 reference; no downgrade) | [Stable formatter/linter](https://biomejs.dev/); test/build-only, no separate LTS |
| lucide / Recharts |1.50.0 /3.10.1 | [Stable icons](https://lucide.dev/) /[charts](https://recharts.github.io/); maintained libraries, no LTS promise |
| Owned primitives |CVA0.7.1,clsx2.1.1,tailwind-merge3.7.0,server-only0.0.1 | Stable exact dependencies reviewed in lockfile; no LTS promise; CVA/server-only0.x need explicit compatibility review |
| Docker / Grafana / Prometheus / collector |Infrastructure selected versions pending | Project does not install or upgrade a shared stack; vps-ops must select official supported versions and validate supplied BO artifacts |

The portfolio frontend at immutable `aed8ea710c8b847ddc9066aaef5ce48d3793b494`
was read via `git show` (AGENTS/CLAUDE/architecture/deployment/Dockerfile); its Next standalone,
exec Node, read-only tmpfs and owned-image separation confirm the same runtime pattern.
No portfolio assets, identity, live working tree or infrastructure configuration were copied.
The BO migration runner uses native Node24 TypeScript stripping and pg; any distroless
candidate must preserve that command, SSR dependencies, uid, health/readiness, PostgreSQL
TLS roots and writable cache bounds. Do not select a smaller base from nominal size alone.
