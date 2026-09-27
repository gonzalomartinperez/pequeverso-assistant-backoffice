/**
 * Branch policy for every pull request into `develop` or `main`
 * (CONTRIBUTING.md#branch-flow-and-protection). Pure: decides from authenticated API metadata only.
 * The route model follows the portfolio repository's branch policy, plus an owner-approved hotfix
 * path requested for this repository.
 *
 * Into `develop`:
 * - standard task branches `type/kebab-case` (feat, fix, chore, docs, refactor, perf, test, ci,
 *   build, revert) from this repository;
 * - Dependabot branches opened by `dependabot[bot]` in this repository;
 * - `main` itself, to merge a released hotfix back.
 * Into `main`:
 * - `develop` (the release path);
 * - `hotfix/*` only with the owner's authorization: the label `hotfix-approved` applied **by the
 *   repository owner** after the latest push. Labels from anyone else or stale approvals fail.
 */

export const HOTFIX_LABEL = "hotfix-approved";

const TASK_BRANCH =
  /^(feat|fix|chore|docs|refactor|perf|test|ci|build|revert)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEPENDABOT_BRANCH = /^dependabot\/(npm_and_yarn|github_actions|docker)\/[A-Za-z0-9._/-]+$/;
const HOTFIX_BRANCH = /^hotfix\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type LabelEvent = {
  event: "labeled" | "unlabeled";
  label: string;
  actor: string;
  createdAt: string;
};

export type RouteFacts = {
  baseRef: string;
  headRef: string;
  headRepo: string;
  repo: string;
  owner: string;
  author: string;
  currentLabels: string[];
  labelEvents: LabelEvent[];
  /** Committer date of the head commit (ISO 8601). */
  headCommittedAt: string;
};

export type RouteDecision = { allowed: boolean; reason: string };

function hotfixApproval(facts: RouteFacts): RouteDecision {
  if (!facts.currentLabels.includes(HOTFIX_LABEL))
    return { allowed: false, reason: `hotfix needs the owner's "${HOTFIX_LABEL}" label` };
  const last = [...facts.labelEvents]
    .filter((event) => event.label === HOTFIX_LABEL)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .at(-1);
  if (last?.event !== "labeled")
    return { allowed: false, reason: `no current "${HOTFIX_LABEL}" label event` };
  if (last.actor !== facts.owner)
    return {
      allowed: false,
      reason: `"${HOTFIX_LABEL}" was applied by ${last.actor}, not the owner ${facts.owner}`,
    };
  if (Date.parse(last.createdAt) < Date.parse(facts.headCommittedAt))
    return {
      allowed: false,
      reason:
        "the hotfix changed after the owner's approval; re-apply the label to approve the new head",
    };
  return { allowed: true, reason: `hotfix approved by ${facts.owner}` };
}

export function decideRoute(facts: RouteFacts): RouteDecision {
  if (facts.headRepo !== facts.repo)
    return { allowed: false, reason: "pull requests must come from branches of this repository" };
  if (facts.baseRef === "main") {
    if (facts.headRef === "develop") return { allowed: true, reason: "release from develop" };
    if (HOTFIX_BRANCH.test(facts.headRef)) return hotfixApproval(facts);
    return {
      allowed: false,
      reason: `only develop or an owner-approved hotfix/* branch may be merged into main (got ${facts.headRef})`,
    };
  }
  if (facts.baseRef === "develop") {
    if (TASK_BRANCH.test(facts.headRef))
      return { allowed: true, reason: "task branch into develop" };
    if (facts.author === "dependabot[bot]" && DEPENDABOT_BRANCH.test(facts.headRef))
      return { allowed: true, reason: "Dependabot update into develop" };
    if (facts.headRef === "main")
      return { allowed: true, reason: "back-merge of main into develop" };
    return {
      allowed: false,
      reason: `use a type/kebab-case task branch (feat, fix, chore, docs, refactor, perf, test, ci, build, revert) into develop (got ${facts.headRef})`,
    };
  }
  return {
    allowed: false,
    reason: `pull requests must target develop or main (got ${facts.baseRef})`,
  };
}
