import "server-only";
import { httpOpsSource } from "../features/operations/adapters/ops-http.ts";
import { readHttpTelemetry } from "../features/operations/adapters/telemetry-http.ts";
import type { OpsReading, TelemetryReading } from "../features/operations/application/ports.ts";
import { config } from "./config.ts";
import { observability } from "./observability.ts";

/** Fresh operational reading for the current request (never cached or shared between users). */
export function readOperations(): Promise<OpsReading> {
  const settings = config();
  return observability(settings.observability).observe(
    "ops_summary",
    (traceparent) => httpOpsSource(settings.ops, fetch, 4000, traceparent).read(),
    (result) => (result.status === "ok" ? "ok" : "unavailable"),
  );
}

export function readTelemetry(): Promise<TelemetryReading> {
  const settings = config();
  if (!settings.telemetryEnabled) return readHttpTelemetry(settings.ops, false);
  return observability(settings.observability).observe(
    "ops_telemetry",
    (traceparent) => readHttpTelemetry(settings.ops, settings.telemetryEnabled, fetch, traceparent),
    (result) => (result.status === "ok" ? "ok" : "unavailable"),
  );
}
