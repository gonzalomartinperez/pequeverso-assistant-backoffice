/**
 * Operational summary of the assistant API, as the dashboard understands it (pure). Money is a
 * decimal string in USD, exactly as the API reports it. `null` always means "not available" and is
 * shown as such: the dashboard never turns a missing value into zero.
 */
export type Money = string | null;

export type Spend = { confirmed: Money; estimated: Money; pending: Money };

export type Percentiles = { p50: number | null; p95: number | null; count: number };

export type RunWindow = {
  hours: number;
  /** Accepted runs end as completed, failed, cancelled or interrupted; refused never streamed. */
  runs: {
    completed: number | null;
    failed: number | null;
    cancelled: number | null;
    interrupted: number | null;
    refused: number | null;
  };
  replaced: number | null;
  failures: Record<string, number>;
  latency: { firstDelta: Percentiles | null; total: Percentiles | null };
  tokens: {
    input: number | null;
    cachedInput: number | null;
    output: number | null;
    reasoning: number | null;
    runsWithUsage: number | null;
  };
};

export type DailyRow = {
  day: string;
  completed: number | null;
  failed: number | null;
  cancelled: number | null;
  interrupted: number | null;
  refused: number | null;
  confirmed: Money;
  estimated: Money;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
};

export const RUN_OUTCOMES = ["completed", "failed", "cancelled", "interrupted", "refused"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/** One recent run, content-free: an opaque id, timing and outcome only. */
export type RecentRun = {
  id: string;
  startedAt: Date;
  outcome: RunOutcome;
  code: string | null;
  modelCall: boolean;
  replaced: boolean;
  language: "es" | "en" | null;
  firstDeltaMs: number | null;
  totalMs: number;
};

/** Rates the API uses to estimate spend. An estimate source, not the provider invoice. */
export type Pricing = {
  revision: string;
  model: string;
  inputPerMillion: Money;
  cachedInputPerMillion: Money;
  cacheWritePerMillion: Money;
  outputPerMillion: Money;
};

export type OpsSummary = {
  generatedAt: Date;
  service: {
    environment: string | null;
    revision: string | null;
    provider: string | null;
    model: string | null;
    reasoningEffort: string | null;
    assistantEnabled: boolean | null;
    startedAt: Date | null;
    synthetic: boolean;
  };
  availability: { status: "available" | "unavailable"; reason: string | null };
  catalog: {
    status: "active" | "missing";
    source: string | null;
    revision: string | null;
    sha256: string | null;
    generatedAt: Date | null;
    verifiedAt: Date | null;
    activatedAt: Date | null;
    priceStatus: "verified" | "unverified" | null;
    priceMaxAgeHours: number | null;
    lastAttemptAt: Date | null;
    lastFailure: string | null;
    lastFailureAt: Date | null;
    products: number | null;
    documents: number | null;
  };
  budget: {
    month: string | null;
    day: string | null;
    monthlyLimit: Money;
    monthlyCutoff: Money;
    dailyLimit: Money;
    monthSpend: Spend;
    daySpend: Spend;
    remainingMonth: Money;
  } | null;
  windows: RunWindow[];
  daily: DailyRow[];
  metricsSince: Date | null;
  pricing: Pricing | null;
  recent: RecentRun[];
};

/** A trend chart needs at least two days with records; one reading is shown as a reading. */
export function hasTrend(daily: readonly DailyRow[]): boolean {
  return daily.length >= 2;
}

/** Runs the API accepted (streamed), or null when any outcome count is missing. */
export function acceptedRuns(runs: RunWindow["runs"]): number | null {
  const parts = [runs.completed, runs.failed, runs.cancelled, runs.interrupted];
  return parts.some((part) => part == null)
    ? null
    : parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
}

/** Share of `part` in `whole` as a 0–100 number, or null when it cannot be computed honestly. */
export function percent(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** Sum of decimal USD strings with micro-dollar precision; null if any part is unavailable. */
export function addMoney(...values: Money[]): Money {
  let micro = 0n;
  for (const value of values) {
    if (value == null) return null;
    const match = /^(-)?(\d+)(?:\.(\d{1,6}))?$/.exec(value);
    if (!match) return null;
    const amount = BigInt(match[2] ?? "0") * 1_000_000n + BigInt((match[3] ?? "").padEnd(6, "0"));
    micro += match[1] ? -amount : amount;
  }
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Fraction of the monthly limit already committed (confirmed + estimated + pending). */
export function budgetUse(summary: OpsSummary): number | null {
  const budget = summary.budget;
  if (!budget || budget.monthlyLimit == null) return null;
  const used = addMoney(
    budget.monthSpend.confirmed,
    budget.monthSpend.estimated,
    budget.monthSpend.pending,
  );
  if (used == null) return null;
  const limit = Number(budget.monthlyLimit);
  return limit > 0 ? (Number(used) / limit) * 100 : null;
}

export type Freshness = "fresh" | "stale" | "unknown";

/** Catalog price freshness from the API's own verdict, falling back to the age window. */
export function catalogFreshness(summary: OpsSummary, now: Date): Freshness {
  const catalog = summary.catalog;
  if (catalog.priceStatus === "verified") return "fresh";
  if (catalog.priceStatus === "unverified") return "stale";
  if (!catalog.verifiedAt || catalog.priceMaxAgeHours == null) return "unknown";
  return now.getTime() - catalog.verifiedAt.getTime() <= catalog.priceMaxAgeHours * 3_600_000
    ? "fresh"
    : "stale";
}
