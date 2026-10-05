import {
  type DailyRow,
  type Money,
  type OpsSummary,
  type Percentiles,
  type Pricing,
  type RecentRun,
  RUN_OUTCOMES,
  type RunOutcome,
  type RunWindow,
  type Spend,
} from "../domain/summary.ts";

/**
 * Runtime validation of the API's private `GET /internal/v1/ops/summary` payload (contract v1).
 * Unknown fields are ignored (the API may add fields within v1); a wrong type, an unsupported
 * schema version or an oversized list rejects the whole payload. Absent optional values become
 * `null`, never zero. Strings are length-bounded because they are rendered.
 */
export class OpsPayloadError extends Error {}

type Json = Record<string, unknown>;

const MAX_TEXT = 200;
const MONEY = /^-?\d{1,9}(?:\.\d{1,6})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const CODE = /^[a-z0-9_.:-]{1,64}$/;

function fail(path: string): never {
  throw new OpsPayloadError(`invalid ops summary at ${path}`);
}

function object(value: unknown, path: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path);
  return value as Json;
}

function optionalObject(value: unknown, path: string): Json | null {
  return value == null ? null : object(value, path);
}

function text(value: unknown, path: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > MAX_TEXT) fail(path);
  return value;
}

function count(value: unknown, path: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(path);
  return value;
}

function bool(value: unknown, path: string): boolean | null {
  if (value == null) return null;
  if (typeof value !== "boolean") fail(path);
  return value;
}

function money(value: unknown, path: string): Money {
  if (value == null) return null;
  if (typeof value !== "string" || !MONEY.test(value)) fail(path);
  return value;
}

function date(value: unknown, path: string): Date | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 40) fail(path);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(path);
  return parsed;
}

function pattern(value: unknown, regex: RegExp, path: string): string | null {
  const parsed = text(value, path);
  if (parsed != null && !regex.test(parsed)) fail(path);
  return parsed;
}

function spend(value: unknown, path: string): Spend {
  const raw = optionalObject(value, path) ?? {};
  return {
    confirmed: money(raw.confirmed, `${path}.confirmed`),
    estimated: money(raw.estimated, `${path}.estimated`),
    pending: money(raw.pending, `${path}.pending`),
  };
}

function percentiles(value: unknown, path: string): Percentiles | null {
  const raw = optionalObject(value, path);
  if (!raw) return null;
  return {
    p50: count(raw.p50, `${path}.p50`),
    p95: count(raw.p95, `${path}.p95`),
    count: count(raw.count, `${path}.count`) ?? 0,
  };
}

function runWindow(value: unknown, path: string): RunWindow {
  const raw = object(value, path);
  const runs = optionalObject(raw.runs, `${path}.runs`) ?? {};
  const latency = optionalObject(raw.latency_ms, `${path}.latency_ms`) ?? {};
  const tokens = optionalObject(raw.tokens, `${path}.tokens`) ?? {};
  const failuresRaw = optionalObject(raw.failures, `${path}.failures`) ?? {};
  const failures: Record<string, number> = {};
  const entries = Object.entries(failuresRaw);
  if (entries.length > 32) fail(`${path}.failures`);
  for (const [code, n] of entries) {
    if (!CODE.test(code)) fail(`${path}.failures`);
    failures[code] = count(n, `${path}.failures.${code}`) ?? fail(`${path}.failures.${code}`);
  }
  const hours = count(raw.hours, `${path}.hours`);
  if (hours == null || hours <= 0) fail(`${path}.hours`);
  return {
    hours,
    runs: {
      completed: count(runs.completed, `${path}.runs.completed`),
      failed: count(runs.failed, `${path}.runs.failed`),
      cancelled: count(runs.cancelled, `${path}.runs.cancelled`),
      interrupted: count(runs.interrupted, `${path}.runs.interrupted`),
      refused: count(runs.refused, `${path}.runs.refused`),
    },
    replaced: count(raw.replaced, `${path}.replaced`),
    failures,
    latency: {
      firstDelta: percentiles(latency.first_delta, `${path}.latency_ms.first_delta`),
      total: percentiles(latency.total, `${path}.latency_ms.total`),
    },
    tokens: {
      input: count(tokens.input, `${path}.tokens.input`),
      cachedInput: count(tokens.cached_input, `${path}.tokens.cached_input`),
      output: count(tokens.output, `${path}.tokens.output`),
      reasoning: count(tokens.reasoning, `${path}.tokens.reasoning`),
      runsWithUsage: count(tokens.runs_with_usage, `${path}.tokens.runs_with_usage`),
    },
  };
}

function dailyRow(value: unknown, path: string): DailyRow {
  const raw = object(value, path);
  const day = pattern(raw.day, DAY, `${path}.day`) ?? fail(`${path}.day`);
  return {
    day,
    completed: count(raw.completed, `${path}.completed`),
    failed: count(raw.failed, `${path}.failed`),
    cancelled: count(raw.cancelled, `${path}.cancelled`),
    interrupted: count(raw.interrupted, `${path}.interrupted`),
    refused: count(raw.refused, `${path}.refused`),
    confirmed: money(raw.confirmed, `${path}.confirmed`),
    estimated: money(raw.estimated, `${path}.estimated`),
    inputTokens: count(raw.input_tokens, `${path}.input_tokens`),
    outputTokens: count(raw.output_tokens, `${path}.output_tokens`),
    reasoningTokens: count(raw.reasoning_tokens, `${path}.reasoning_tokens`),
  };
}

const OPAQUE_ID = /^[0-9a-f]{16}$/;

function recentRun(value: unknown, path: string): RecentRun {
  const raw = object(value, path);
  const id = pattern(raw.id, OPAQUE_ID, `${path}.id`) ?? fail(`${path}.id`);
  const outcome = raw.outcome;
  if (!RUN_OUTCOMES.includes(outcome as RunOutcome)) fail(`${path}.outcome`);
  const language = raw.language ?? null;
  if (language !== null && language !== "es" && language !== "en") fail(`${path}.language`);
  const flag = (key: string) => bool(raw[key], `${path}.${key}`) ?? fail(`${path}.${key}`);
  return {
    id,
    startedAt: date(raw.started_at, `${path}.started_at`) ?? fail(`${path}.started_at`),
    outcome: outcome as RunOutcome,
    code: pattern(raw.code, CODE, `${path}.code`),
    modelCall: flag("model_call"),
    replaced: flag("replaced"),
    language,
    firstDeltaMs: count(raw.first_delta_ms, `${path}.first_delta_ms`),
    totalMs: count(raw.total_ms, `${path}.total_ms`) ?? fail(`${path}.total_ms`),
  };
}

function pricing(value: unknown): Pricing | null {
  const raw = optionalObject(value, "$.pricing");
  if (!raw) return null;
  return {
    revision: text(raw.revision, "$.pricing.revision") ?? fail("$.pricing.revision"),
    model: text(raw.model, "$.pricing.model") ?? fail("$.pricing.model"),
    inputPerMillion: money(raw.input_per_million, "$.pricing.input_per_million"),
    cachedInputPerMillion: money(
      raw.cached_input_per_million,
      "$.pricing.cached_input_per_million",
    ),
    cacheWritePerMillion: money(raw.cache_write_per_million, "$.pricing.cache_write_per_million"),
    outputPerMillion: money(raw.output_per_million, "$.pricing.output_per_million"),
  };
}

function list<T>(
  value: unknown,
  max: number,
  path: string,
  item: (v: unknown, p: string) => T,
): T[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) fail(path);
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

export function parseOpsSummary(value: unknown): OpsSummary {
  const raw = object(value, "$");
  if (raw.schema_version !== "1") fail("$.schema_version");
  const generatedAt = date(raw.generated_at, "$.generated_at") ?? fail("$.generated_at");
  const service = object(raw.service, "$.service");
  const availability = object(raw.availability, "$.availability");
  const catalog = object(raw.catalog, "$.catalog");
  const budget = optionalObject(raw.budget, "$.budget");
  const status = availability.status;
  if (status !== "available" && status !== "unavailable") fail("$.availability.status");
  const catalogStatus = catalog.status;
  if (catalogStatus !== "active" && catalogStatus !== "missing") fail("$.catalog.status");
  const priceStatus = catalog.price_status ?? null;
  if (priceStatus !== null && priceStatus !== "verified" && priceStatus !== "unverified")
    fail("$.catalog.price_status");
  const provider = pattern(service.provider, CODE, "$.service.provider");
  const daily = list(raw.daily, 60, "$.daily", dailyRow).sort((a, b) => a.day.localeCompare(b.day));
  return {
    generatedAt,
    service: {
      environment: pattern(service.environment, CODE, "$.service.environment"),
      revision: text(service.revision, "$.service.revision"),
      provider,
      model: text(service.model, "$.service.model"),
      reasoningEffort: text(service.reasoning_effort, "$.service.reasoning_effort"),
      assistantEnabled: bool(service.assistant_enabled, "$.service.assistant_enabled"),
      startedAt: date(service.started_at, "$.service.started_at"),
      // Synthetic unless the API says otherwise and the provider is not the fixture.
      synthetic: bool(service.synthetic, "$.service.synthetic") !== false || provider === "fixture",
    },
    availability: { status, reason: pattern(availability.reason, CODE, "$.availability.reason") },
    catalog: {
      status: catalogStatus,
      source: pattern(catalog.source, CODE, "$.catalog.source"),
      revision: text(catalog.revision, "$.catalog.revision"),
      sha256: text(catalog.sha256, "$.catalog.sha256"),
      generatedAt: date(catalog.generated_at, "$.catalog.generated_at"),
      verifiedAt: date(catalog.verified_at, "$.catalog.verified_at"),
      activatedAt: date(catalog.activated_at, "$.catalog.activated_at"),
      priceStatus,
      priceMaxAgeHours: count(catalog.price_max_age_hours, "$.catalog.price_max_age_hours"),
      lastAttemptAt: date(catalog.last_attempt_at, "$.catalog.last_attempt_at"),
      lastFailure: text(catalog.last_failure, "$.catalog.last_failure"),
      lastFailureAt: date(catalog.last_failure_at, "$.catalog.last_failure_at"),
      products: count(catalog.products, "$.catalog.products"),
      documents: count(catalog.documents, "$.catalog.documents"),
    },
    budget: budget
      ? {
          month: pattern(budget.month, MONTH, "$.budget.month"),
          day: pattern(budget.day, DAY, "$.budget.day"),
          monthlyLimit: money(budget.monthly_limit, "$.budget.monthly_limit"),
          monthlyCutoff: money(budget.monthly_cutoff, "$.budget.monthly_cutoff"),
          dailyLimit: money(budget.daily_limit, "$.budget.daily_limit"),
          monthSpend: spend(budget.month_spend, "$.budget.month_spend"),
          daySpend: spend(budget.day_spend, "$.budget.day_spend"),
          remainingMonth: money(budget.remaining_month, "$.budget.remaining_month"),
        }
      : null,
    windows: list(raw.windows, 8, "$.windows", runWindow),
    daily,
    metricsSince: date(raw.metrics_since, "$.metrics_since"),
    pricing: pricing(raw.pricing),
    recent: list(raw.recent, 50, "$.recent", recentRun),
  };
}
