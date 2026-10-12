import type { OpsTelemetry } from "../domain/telemetry.ts";
import { OpsPayloadError } from "./validate.ts";

type Json = Record<string, unknown>;
function fail(): never {
  throw new OpsPayloadError("invalid private telemetry");
}
function object(value: unknown): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  return value as Json;
}
function number(value: unknown, integer = true): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER ||
    (integer && !Number.isInteger(value))
  )
    fail();
  return value;
}
function nullableNumber(value: unknown, integer = true): number | null {
  return value === null ? null : number(value, integer);
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") fail();
  return value;
}
function constant(value: unknown, expected: string | boolean): void {
  if (value !== undefined && value !== expected) fail();
}
function date(value: unknown): Date {
  if (
    typeof value !== "string" ||
    value.length > 50 ||
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    fail();
  const calendar = value.slice(0, 10);
  const day = new Date(`${calendar}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== calendar) fail();
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) fail();
  return result;
}

/** Validate at the boundary, select safe fields only; unknown optional additions are ignored. */
export function parseOpsTelemetry(value: unknown): OpsTelemetry {
  const root = object(value);
  if (root.schema_version !== "1") fail();
  const readiness = object(root.readiness),
    provider = object(root.provider_observation);
  const resources = object(root.resources),
    http = object(root.http),
    traces = object(root.traces);
  if (readiness.status !== "ready" && readiness.status !== "not_ready") fail();
  constant(readiness.measurement, "point_in_time");
  constant(provider.status, "unknown");
  constant(provider.reason, "not_probed");
  constant(resources.cgroup_scope, "enclosing_cgroup_may_be_shared");
  constant(http.window, "since_process_start");
  constant(http.error_scope, "http_5xx_only_not_sse_run_outcomes");
  constant(traces.durable, false);
  const samplingRatio = number(traces.sampling_ratio, false);
  if (samplingRatio > 1) fail();
  const maxConcurrentRuns = number(root.max_concurrent_runs);
  if (maxConcurrentRuns < 1) fail();
  return {
    generatedAt: date(root.generated_at),
    processStartedAt: date(root.process_started_at),
    processUptimeSeconds: number(root.process_uptime_seconds, false),
    synthetic: boolean(root.synthetic),
    readiness: { ready: readiness.status === "ready", checkedAt: date(readiness.checked_at) },
    activeRuns: number(root.active_runs),
    maxConcurrentRuns,
    resources: {
      processRssBytes: nullableNumber(resources.process_rss_bytes),
      processPeakRssBytes: nullableNumber(resources.process_peak_rss_bytes),
      cgroupMemoryCurrentBytes: nullableNumber(resources.cgroup_memory_current_bytes),
      cgroupMemoryLimitBytes: nullableNumber(resources.cgroup_memory_limit_bytes),
      cgroupCpuLimitCores: nullableNumber(resources.cgroup_cpu_limit_cores, false),
      cgroupPidsCurrent: nullableNumber(resources.cgroup_pids_current),
      cgroupPidsLimit: nullableNumber(resources.cgroup_pids_limit),
    },
    http: {
      requests: number(http.requests),
      serverErrors: number(http.server_errors),
      inflight: number(http.inflight),
    },
    traces: {
      enabled: boolean(traces.enabled),
      samplingRatio,
      exportSuccesses: number(traces.export_successes),
      exportFailures: number(traces.export_failures),
      lastExportAt: traces.last_export_at === null ? null : date(traces.last_export_at),
      lastExportSuccess:
        traces.last_export_success === null ? null : boolean(traces.last_export_success),
    },
  };
}
