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
3. GitHub merges only when the `protect-develop` ruleset is satisfied: **Required checks** (static
   checks, production image, browser suite against the image) green on a head that is up to date with
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
`@dependabot rebase` or closing. Cooldowns (3/7/14 days for patch/minor/major) and grouping reduce
churn for routine updates; they do not delay security updates.

## Security updates

Dependabot raises security updates against the **default branch (`main`)**, not `target-branch`.
They are never auto-merged, and the **Branch policy** check blocks merging them into `main`
directly. Re-target them for normal integration: `gh pr edit <number> --base develop` (or let the
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
