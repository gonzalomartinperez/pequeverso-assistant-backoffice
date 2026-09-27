import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideRoute, type RouteFacts } from "../../scripts/branch-policy/policy.ts";

const REPO = "gonzalomartinperez/pequeverso-assistant-web";
const facts = (overrides: Partial<RouteFacts> = {}): RouteFacts => ({
  baseRef: "main",
  headRef: "develop",
  headRepo: REPO,
  repo: REPO,
  owner: "gonzalomartinperez",
  author: "gonzalomartinperez",
  currentLabels: [],
  labelEvents: [],
  headCommittedAt: "2026-09-27T10:00:00Z",
  ...overrides,
});

const approved = (actor = "gonzalomartinperez", at = "2026-09-27T11:00:00Z") => ({
  currentLabels: ["hotfix-approved"],
  labelEvents: [{ event: "labeled" as const, label: "hotfix-approved", actor, createdAt: at }],
});

const allowed = (overrides: Partial<RouteFacts>) => decideRoute(facts(overrides)).allowed;

describe("routes into develop", () => {
  it("accepts standard type/kebab-case task branches", () => {
    for (const headRef of [
      "feat/embed-panel",
      "fix/scroll-race",
      "docs/verification",
      "ci/branch-policy",
      "revert/x",
    ])
      assert.equal(allowed({ baseRef: "develop", headRef }), true, headRef);
  });

  it("refuses non-standard names", () => {
    for (const headRef of [
      "feature/x",
      "feat/Upper",
      "feat/under_score",
      "my-branch",
      "feat/",
      "hotfix/x",
      "develop",
    ])
      assert.equal(allowed({ baseRef: "develop", headRef }), false, headRef);
  });

  it("accepts Dependabot branches only when opened by dependabot[bot]", () => {
    const headRef = "dependabot/github_actions/develop/actions/checkout-7.0.1";
    assert.equal(allowed({ baseRef: "develop", headRef, author: "dependabot[bot]" }), true);
    assert.equal(allowed({ baseRef: "develop", headRef, author: "someone" }), false);
  });

  it("accepts the main back-merge after a hotfix", () => {
    assert.equal(allowed({ baseRef: "develop", headRef: "main" }), true);
  });

  it("refuses forks", () => {
    assert.equal(
      allowed({ baseRef: "develop", headRef: "feat/x", headRepo: "someone/fork" }),
      false,
    );
  });
});

describe("routes into main", () => {
  it("accepts develop from this repository", () => assert.equal(allowed({}), true));

  it("refuses task branches, other branches and forks", () => {
    for (const headRef of ["feat/x", "fix/y", "dependabot/npm_and_yarn/next-16.3.7", "release"])
      assert.equal(allowed({ headRef }), false, headRef);
    assert.equal(allowed({ headRepo: "someone/fork" }), false);
  });

  it("refuses a hotfix without the owner's approval label", () => {
    assert.equal(allowed({ headRef: "hotfix/checkout-link" }), false);
  });

  it("accepts a hotfix approved by the owner after the latest push", () => {
    assert.equal(allowed({ headRef: "hotfix/checkout-link", ...approved() }), true);
  });

  it("does not accept the label from anyone but the owner", () => {
    const decision = decideRoute(
      facts({ headRef: "hotfix/checkout-link", ...approved("another-user") }),
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /not the owner/);
  });

  it("invalidates an approval older than the head commit", () => {
    const decision = decideRoute(
      facts({
        headRef: "hotfix/checkout-link",
        ...approved(),
        headCommittedAt: "2026-09-27T12:00:00Z",
      }),
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /changed after the owner's approval/);
  });

  it("uses the latest label event: a removed or re-applied-by-others approval does not count", () => {
    const decision = decideRoute(
      facts({
        headRef: "hotfix/checkout-link",
        currentLabels: ["hotfix-approved"],
        labelEvents: [
          {
            event: "labeled",
            label: "hotfix-approved",
            actor: "gonzalomartinperez",
            createdAt: "2026-09-27T11:00:00Z",
          },
          {
            event: "unlabeled",
            label: "hotfix-approved",
            actor: "gonzalomartinperez",
            createdAt: "2026-09-27T11:05:00Z",
          },
          {
            event: "labeled",
            label: "hotfix-approved",
            actor: "another-user",
            createdAt: "2026-09-27T11:10:00Z",
          },
        ],
      }),
    );
    assert.equal(decision.allowed, false);
  });
});

it("refuses pull requests into any other base branch", () => {
  assert.equal(allowed({ baseRef: "feat/x", headRef: "fix/y" }), false);
});
