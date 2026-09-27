/**
 * Branch-flow rule for pull requests into `main` (CONTRIBUTING.md#branch-flow-and-protection).
 * Pure: decides from authenticated API metadata only.
 *
 * - `develop` → `main`: the normal release path.
 * - `hotfix/*` → `main`: only with the repository owner's authorization, recorded as the label
 *   `hotfix-approved` applied **by the owner** after the latest push. Labels added by anyone else,
 *   or approvals older than the head commit, do not count.
 * - Anything else into `main` is refused. Pull requests into other branches are not restricted here.
 */

export const HOTFIX_LABEL = "hotfix-approved";

export type LabelEvent = {
  event: "labeled" | "unlabeled";
  label: string;
  actor: string;
  createdAt: string;
};

export type ReleaseFacts = {
  baseRef: string;
  headRef: string;
  headRepo: string;
  repo: string;
  owner: string;
  currentLabels: string[];
  labelEvents: LabelEvent[];
  /** Committer date of the head commit (ISO 8601). */
  headCommittedAt: string;
};

export type ReleaseDecision = { allowed: boolean; reason: string };

export function decideRelease(facts: ReleaseFacts): ReleaseDecision {
  if (facts.baseRef !== "main")
    return { allowed: true, reason: `not a pull request into main (${facts.baseRef})` };
  if (facts.headRepo !== facts.repo)
    return { allowed: false, reason: "pull requests into main must come from this repository" };
  if (facts.headRef === "develop") return { allowed: true, reason: "release from develop" };
  if (!facts.headRef.startsWith("hotfix/"))
    return {
      allowed: false,
      reason: `only develop or an owner-approved hotfix/* branch may be merged into main (got ${facts.headRef})`,
    };
  if (!facts.currentLabels.includes(HOTFIX_LABEL))
    return { allowed: false, reason: `hotfix needs the owner's "${HOTFIX_LABEL}" label` };
  const last = [...facts.labelEvents]
    .filter((event) => event.label === HOTFIX_LABEL)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .at(-1);
  if (!last || last.event !== "labeled")
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
