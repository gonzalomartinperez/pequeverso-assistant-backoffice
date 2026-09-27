/**
 * Dependabot auto-merge eligibility policy (docs/dependencies.md). Pure: it decides from
 * authenticated GitHub API metadata and the base/head manifests read as data. It never runs PR
 * code. The only automatic action it can authorize is enabling GitHub's native auto-merge for the
 * evaluated head SHA; required checks and branch rules stay authoritative.
 */

/** Patch updates allowed automatically: small, well-covered libraries and tools. */
export const PATCH_ALLOW: ReadonlySet<string> = new Set([
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "@biomejs/biome",
  "@axe-core/playwright",
  "@types/node",
  "@types/react",
  "@types/react-dom",
]);

/** Minor updates allowed automatically (additive APIs, fully exercised by the suites). */
export const MINOR_ALLOW: ReadonlySet<string> = new Set([
  "lucide-react",
  "clsx",
  "@axe-core/playwright",
]);

/**
 * Never automatic: runtime/compiler/framework/styling migrations and the browser-test engine.
 * (Deny wins over allow.)
 */
export const DENY: ReadonlySet<string> = new Set([
  "next",
  "react",
  "react-dom",
  "typescript",
  "tailwindcss",
  "@tailwindcss/postcss",
  "@playwright/test",
  "server-only",
]);

export const DEPENDABOT_LOGIN = "dependabot[bot]";
export const TARGET_BRANCH = "develop";
const MANIFESTS = new Set(["package.json", "package-lock.json"]);
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies"] as const;

export type PullRequestFacts = {
  number: number;
  authorLogin: string;
  authorType: string;
  headRepo: string;
  baseRepo: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  draft: boolean;
  labels: string[];
  /** Paths changed by the whole PR (base...head). */
  files: string[];
  /** GitHub logins of every commit author and committer in the PR. */
  commitAuthors: string[];
  commitCommitters: string[];
  /** Raw manifest text at the base and head revisions (null when absent). */
  basePackageJson: string | null;
  headPackageJson: string | null;
  /** Repository variable DEPENDABOT_AUTOMERGE ("off" pauses automation). */
  automation: string | undefined;
};

export type Update = { name: string; from: string; to: string; kind: UpdateKind };
export type UpdateKind = "patch" | "minor" | "major" | "prerelease" | "unknown";

export type Decision =
  | { verdict: "auto-merge"; headSha: string; updates: Update[]; reasons: string[] }
  | { verdict: "manual"; updates: Update[]; reasons: string[] };

type Version = { major: number; minor: number; patch: number; prerelease: boolean };

/** Exact versions only (this repository pins with `npm install -E`); ranges are "unknown". */
export function parseVersion(value: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Boolean(match[4]),
  };
}

export function classify(from: string, to: string): UpdateKind {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b) return "unknown";
  if (a.prerelease || b.prerelease) return "prerelease";
  if (b.major !== a.major) return b.major > a.major ? "major" : "unknown";
  // In 0.x a minor bump may break the API (semver §4), so it is treated as major.
  if (b.minor !== a.minor) {
    if (b.minor < a.minor) return "unknown";
    return a.major === 0 ? "major" : "minor";
  }
  if (b.patch > a.patch) return "patch";
  return "unknown"; // downgrade or no change
}

type Manifest = Record<string, unknown>;

function parseManifest(text: string | null): Manifest | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Manifest)
      : null;
  } catch {
    return null;
  }
}

function dependencyMap(
  manifest: Manifest,
  field: (typeof DEPENDENCY_FIELDS)[number],
): Record<string, string> | null {
  const value = manifest[field];
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [name, version] of Object.entries(value)) {
    if (typeof version !== "string") return null;
    out[name] = version;
  }
  return out;
}

/**
 * Semantic package.json comparison: only dependency version strings may change. Scripts, engines,
 * added/removed packages or any other field make the PR ineligible.
 */
export function manifestUpdates(
  base: string | null,
  head: string | null,
): { updates: Update[]; problems: string[] } {
  const before = parseManifest(base);
  const after = parseManifest(head);
  if (!before || !after)
    return { updates: [], problems: ["package.json could not be read at base or head"] };
  const problems: string[] = [];
  const otherKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const field of DEPENDENCY_FIELDS) otherKeys.delete(field);
  for (const key of otherKeys)
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      problems.push(`package.json field "${key}" changed`);
  const updates: Update[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const a = dependencyMap(before, field);
    const b = dependencyMap(after, field);
    if (!a || !b) {
      problems.push(`package.json "${field}" is malformed`);
      continue;
    }
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const from = a[name];
      const to = b[name];
      if (from === undefined) problems.push(`${name} was added to ${field}`);
      else if (to === undefined) problems.push(`${name} was removed from ${field}`);
      else if (from !== to) updates.push({ name, from, to, kind: classify(from, to) });
    }
  }
  return { updates, problems };
}

function updateReason(update: Update): string | null {
  const label = `${update.name} ${update.from} → ${update.to} (${update.kind})`;
  if (DENY.has(update.name))
    return `${label}: runtime/compiler/framework/test-engine dependency requires review`;
  if (update.kind === "patch")
    return PATCH_ALLOW.has(update.name) ? null : `${label}: not on the patch allowlist`;
  if (update.kind === "minor")
    return MINOR_ALLOW.has(update.name) ? null : `${label}: not on the minor allowlist`;
  return `${label}: ${update.kind} updates always require review`;
}

export function decide(pr: PullRequestFacts): Decision {
  const reasons: string[] = [];
  if (pr.automation?.trim().toLowerCase() === "off")
    reasons.push("automation paused (DEPENDABOT_AUTOMERGE=off)");
  if (pr.authorLogin !== DEPENDABOT_LOGIN || pr.authorType !== "Bot")
    reasons.push("author is not dependabot[bot]");
  if (pr.headRepo !== pr.baseRepo) reasons.push("head repository differs from the base repository");
  if (!pr.headRef.startsWith("dependabot/")) reasons.push("head branch is not a Dependabot branch");
  if (pr.baseRef !== TARGET_BRANCH)
    reasons.push(`base branch is ${pr.baseRef}, not ${TARGET_BRANCH}`);
  if (pr.draft) reasons.push("pull request is a draft");
  if (pr.labels.includes("dependencies:hold"))
    reasons.push("held for manual review (label dependencies:hold)");
  if (pr.commitAuthors.length === 0) reasons.push("no commits could be verified");
  if (pr.commitAuthors.some((login) => login !== DEPENDABOT_LOGIN))
    reasons.push("a commit was authored by someone other than dependabot[bot]");
  if (pr.commitCommitters.some((login) => login !== DEPENDABOT_LOGIN && login !== "web-flow"))
    reasons.push("a commit was committed by someone other than dependabot[bot]/GitHub");
  const unexpected = pr.files.filter((file) => !MANIFESTS.has(file));
  if (unexpected.length)
    reasons.push(`changes outside package.json/package-lock.json: ${unexpected.join(", ")}`);
  if (!pr.files.includes("package.json"))
    reasons.push(
      pr.files.includes("package-lock.json")
        ? "lockfile-only change: its full transitive impact cannot be established automatically"
        : "not an npm manifest update (package.json unchanged)",
    );
  const { updates, problems } = manifestUpdates(pr.basePackageJson, pr.headPackageJson);
  reasons.push(...problems);
  if (pr.files.includes("package.json") && updates.length === 0 && problems.length === 0)
    reasons.push("no dependency version change detected");
  // A group is eligible only when every included update qualifies.
  for (const update of updates) {
    const reason = updateReason(update);
    if (reason) reasons.push(reason);
  }
  if (reasons.length) return { verdict: "manual", updates, reasons };
  return {
    verdict: "auto-merge",
    headSha: pr.headSha,
    updates,
    reasons: updates.map((u) => `${u.name} ${u.from} → ${u.to} (${u.kind}) is allowlisted`),
  };
}
