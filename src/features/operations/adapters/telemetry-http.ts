import type { TelemetryReading } from "../application/ports.ts";
import { privateTraceHeader, readBounded } from "./ops-http.ts";
import { parseOpsTelemetry } from "./telemetry-validate.ts";

/** Independent optional read: API404/off is expected and never invalidates legacy summary. */
export async function readHttpTelemetry(
  settings: { url: string; token: string } | null,
  enabled: boolean,
  fetcher: typeof fetch = fetch,
  traceparent: string | null = null,
): Promise<TelemetryReading> {
  const fetchedAt = new Date();
  if (!enabled) return { status: "unavailable", reason: "disabled", fetchedAt };
  if (!settings) return { status: "unavailable", reason: "not_configured", fetchedAt };
  try {
    const response = await fetcher(`${settings.url}/internal/v1/ops/telemetry`, {
      headers: {
        Authorization: `Bearer ${settings.token}`,
        Accept: "application/json",
        ...privateTraceHeader(traceparent),
      },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        status: "unavailable",
        reason: response.status === 404 ? "disabled" : "rejected",
        fetchedAt,
      };
    }
    const telemetry = parseOpsTelemetry(JSON.parse(await readBounded(response, 64 * 1024)));
    return { status: "ok", telemetry, fetchedAt };
  } catch {
    return { status: "unavailable", reason: "invalid_or_unreachable", fetchedAt };
  }
}
