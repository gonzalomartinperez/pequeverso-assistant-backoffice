/**
 * Runs the Dependabot policy for one pull request inside the trusted `pull_request_target`
 * workflow (.github/workflows/dependency-policy.yml). It reads only GitHub API metadata and file
 * contents as data (never checks out, installs or executes PR code) and then either enables
 * GitHub's native auto-merge for the evaluated head SHA or makes sure auto-merge is off.
 * Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, DEPENDABOT_AUTOMERGE, GITHUB_STEP_SUMMARY.
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

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors?.length)
    throw new Error(`GraphQL: ${body.errors?.map((e) => e.message).join("; ")}`);
  return body.data as T;
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
  node_id: string;
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
  automation: process.env.DEPENDABOT_AUTOMERGE,
};
const decision: Decision = decide(facts);

async function setLabel(add: string, remove: string) {
  await fetch(`${API}/repos/${repository}/issues/${number}/labels`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ labels: [add] }),
  });
  if (facts.labels.includes(remove))
    await fetch(
      `${API}/repos/${repository}/issues/${number}/labels/${encodeURIComponent(remove)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
}

if (decision.verdict === "auto-merge") {
  // expectedHeadOid: GitHub refuses to merge if the head moved after this evaluation.
  await graphql(
    `mutation($id: ID!, $sha: GitObjectID!) {
      enablePullRequestAutoMerge(input: {pullRequestId: $id, mergeMethod: MERGE, expectedHeadOid: $sha}) { clientMutationId }
    }`,
    { id: pr.node_id, sha: decision.headSha },
  );
  await setLabel("dependencies:auto-merge", "dependencies:manual-review");
} else {
  if (pr.auto_merge)
    await graphql(
      `mutation($id: ID!) { disablePullRequestAutoMerge(input: {pullRequestId: $id}) { clientMutationId } }`,
      { id: pr.node_id },
    );
  await setLabel("dependencies:manual-review", "dependencies:auto-merge");
}

const summary = [
  `### Dependency policy for #${number} at ${facts.headSha.slice(0, 12)}`,
  "",
  decision.verdict === "auto-merge"
    ? "**Eligible**: native auto-merge enabled for this head; required checks and branch rules still decide."
    : "**Manual review required**; auto-merge is off.",
  "",
  ...decision.updates.map((u) => `- \`${u.name}\` ${u.from} → ${u.to} (${u.kind})`),
  "",
  ...decision.reasons.map((reason) => `- ${reason}`),
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
