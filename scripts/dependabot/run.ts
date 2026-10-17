/**
 * Runs the Dependabot policy for one pull request inside the trusted `pull_request_target`
 * workflow (.github/workflows/dependency-policy.yml). It reads only GitHub API metadata and file
 * contents as data (never checks out, installs or executes PR code), then reports an assessment.
 * No merge, approval, label or other repository mutation is available.
 * Environment: read-only GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, GITHUB_STEP_SUMMARY.
 */
import { appendFileSync } from "node:fs";
import { type Decision, decide, type PullRequestFacts } from "./policy.ts";

const API = "https://api.github.com";
const token = required("GITHUB_TOKEN");
const repository = required("GITHUB_REPOSITORY");
const number = Number(required("PR_NUMBER"));
if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !Number.isSafeInteger(number) || number <= 0)
  throw new Error("invalid repository or pull request number");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function rest<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept, "x-github-api-version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`);
  return (accept.includes("raw") ? await response.text() : await response.json()) as T;
}

async function paged<T>(path: string, limit: number): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; items.length < limit; page++) {
    const batch = await rest<T[]>(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

async function manifestAt(sha: string): Promise<string | null> {
  try {
    return await rest<string>(
      `/repos/${repository}/contents/package.json?ref=${sha}`,
      "application/vnd.github.raw+json",
    );
  } catch {
    return null;
  }
}

type PullResponse = {
  draft: boolean;
  user: { login: string; type: string };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string; repo: { full_name: string } };
  labels: { name: string }[];
  auto_merge: unknown;
};
type CommitResponse = { author: { login: string } | null; committer: { login: string } | null };

const pr = await rest<PullResponse>(`/repos/${repository}/pulls/${number}`);
const files = await paged<{ filename: string }>(`/repos/${repository}/pulls/${number}/files`, 3000);
const commits = await paged<CommitResponse>(`/repos/${repository}/pulls/${number}/commits`, 250);
const facts: PullRequestFacts = {
  number,
  authorLogin: pr.user.login,
  authorType: pr.user.type,
  headRepo: pr.head.repo?.full_name ?? "",
  baseRepo: pr.base.repo.full_name,
  headRef: pr.head.ref,
  baseRef: pr.base.ref,
  headSha: pr.head.sha,
  draft: pr.draft,
  labels: pr.labels.map((label) => label.name),
  files: files.map((file) => file.filename),
  commitAuthors: commits.map((commit) => commit.author?.login ?? "(unverified)"),
  commitCommitters: commits.map((commit) => commit.committer?.login ?? "(unverified)"),
  basePackageJson: await manifestAt(pr.base.sha),
  headPackageJson: await manifestAt(pr.head.sha),
  automation: undefined,
};
const decision: Decision = decide(facts);

const summary = [
  `### Dependency policy for #${number} at ${facts.headSha.slice(0, 12)}`,
  "",
  decision.verdict === "eligible"
    ? "**Lower-risk assessment eligible**; review and merge remain manual."
    : "**Elevated manual review required**; this report cannot merge or approve.",
  "Automatic merging is disabled by policy for every assessment.",
  ...(pr.auto_merge
    ? [
        "**Action required:** native auto-merge is already armed; an authorized maintainer must disable it. This read-only report cannot change it.",
      ]
    : []),
  "",
  ...decision.updates.map((u) => `- \`${u.name}\` ${u.from} → ${u.to} (${u.kind})`),
  "",
  ...decision.reasons.map((reason) => `- ${reason}`),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
