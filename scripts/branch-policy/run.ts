/**
 * Evaluates the branch policy for one pull request (.github/workflows/branch-policy.yml) from
 * authenticated GitHub API metadata and fails the check when the flow is not allowed.
 * Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, GITHUB_STEP_SUMMARY.
 */
import { appendFileSync } from "node:fs";
import { decideRoute, type LabelEvent } from "./policy.ts";

const API = "https://api.github.com";
const token = process.env.GITHUB_TOKEN ?? "";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const number = Number(process.env.PR_NUMBER);
if (
  !token ||
  !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
  !Number.isSafeInteger(number) ||
  number <= 0
)
  throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required");

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`);
  return (await response.json()) as T;
}

type Pull = {
  user: { login: string };
  base: { ref: string; repo: { full_name: string; owner: { login: string } } };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  labels: { name: string }[];
};
type IssueEvent = {
  event: string;
  label?: { name: string };
  actor: { login: string } | null;
  created_at: string;
};

const pr = await get<Pull>(`/repos/${repository}/pulls/${number}`);
const events: IssueEvent[] = [];
for (let page = 1; page <= 10; page++) {
  const batch = await get<IssueEvent[]>(
    `/repos/${repository}/issues/${number}/events?per_page=100&page=${page}`,
  );
  events.push(...batch);
  if (batch.length < 100) break;
}
const head = await get<{ commit: { committer: { date: string } } }>(
  `/repos/${repository}/commits/${pr.head.sha}`,
);
const labelEvents: LabelEvent[] = events.flatMap((event) =>
  (event.event === "labeled" || event.event === "unlabeled") && event.label && event.actor
    ? [
        {
          event: event.event,
          label: event.label.name,
          actor: event.actor.login,
          createdAt: event.created_at,
        },
      ]
    : [],
);
const decision = decideRoute({
  baseRef: pr.base.ref,
  headRef: pr.head.ref,
  headRepo: pr.head.repo?.full_name ?? "",
  repo: pr.base.repo.full_name,
  owner: pr.base.repo.owner.login,
  author: pr.user.login,
  currentLabels: pr.labels.map((label) => label.name),
  labelEvents,
  headCommittedAt: head.commit.committer.date,
});
const line = `${decision.allowed ? "Allowed" : "Refused"}: ${decision.reason}`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Branch policy\n\n${line}\n`);
if (!decision.allowed) process.exitCode = 1;
