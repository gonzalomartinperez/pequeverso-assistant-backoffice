import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideRelease, type ReleaseFacts } from "../../scripts/release/flow.ts";

const facts = (overrides: Partial<ReleaseFacts> = {}): ReleaseFacts => ({
  baseRef: "main",
  headRef: "develop",
  headRepo: "gonzalomartinperez/pequeverso-assistant-web",
  repo: "gonzalomartinperez/pequeverso-assistant-web",
  owner: "gonzalomartinperez",
  currentLabels: [],
  labelEvents: [],
  headCommittedAt: "2026-09-27T10:00:00Z",
  ...overrides,
});

const approved = (actor = "gonzalomartinperez", at = "2026-09-27T11:00:00Z") => ({
  currentLabels: ["hotfix-approved"],
  labelEvents: [{ event: "labeled" as const, label: "hotfix-approved", actor, createdAt: at }],
});

describe("release flow into main", () => {
  it("allows develop → main", () => assert.equal(decideRelease(facts()).allowed, true));

  it("refuses task branches, other branches and forks into main", () => {
    for (const headRef of ["feat/x", "fix/y", "dependabot/npm_and_yarn/next-16.3.7", "release"])
      assert.equal(decideRelease(facts({ headRef })).allowed, false, headRef);
    assert.equal(decideRelease(facts({ headRepo: "someone/fork" })).allowed, false);
  });

  it("refuses a hotfix without the owner's approval label", () => {
    assert.equal(decideRelease(facts({ headRef: "hotfix/checkout-link" })).allowed, false);
  });

  it("allows a hotfix approved by the owner after the latest push", () => {
    assert.equal(
      decideRelease(facts({ headRef: "hotfix/checkout-link", ...approved() })).allowed,
      true,
    );
  });

  it("does not accept the label from anyone but the owner", () => {
    const decision = decideRelease(
      facts({ headRef: "hotfix/checkout-link", ...approved("another-user") }),
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /not the owner/);
  });

  it("invalidates an approval older than the head commit", () => {
    const decision = decideRelease(
      facts({
        headRef: "hotfix/checkout-link",
        ...approved(),
        headCommittedAt: "2026-09-27T12:00:00Z",
      }),
    );
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /changed after the owner's approval/);
  });

  it("uses the latest label event: removed approval no longer counts", () => {
    const decision = decideRelease(
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
            actor: "someone-else",
            createdAt: "2026-09-27T11:10:00Z",
          },
        ],
      }),
    );
    assert.equal(decision.allowed, false);
  });

  it("does not restrict pull requests into develop", () => {
    assert.equal(
      decideRelease(facts({ baseRef: "develop", headRef: "feat/anything" })).allowed,
      true,
    );
  });
});
