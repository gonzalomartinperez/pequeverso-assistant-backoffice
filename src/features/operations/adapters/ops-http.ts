import type { OpsReading, OpsSource } from "../application/ports.ts";
import { OpsPayloadError, parseOpsSummary } from "./validate.ts";

const MAX_BYTES = 256 * 1024;

/** Only generated W3C00 contexts can cross the private adapter boundary. */
export function privateTraceHeader(value: string | null): Record<string, string> {
  if (
    !value ||
    !/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(value) ||
    value.slice(3, 35) === "0".repeat(32) ||
    value.slice(36, 52) === "0".repeat(16)
  )
    return {};
  return { traceparent: value };
}

/**
 * Server-to-server client for `GET {OPS_API_URL}/internal/v1/ops/summary` with a bearer token.
 * Never cached, bounded in time and size, no redirects followed. Every failure collapses into an
 * "unavailable" reading without details that could leak configuration to the page.
 */
export function httpOpsSource(
  settings: { url: string; token: string } | null,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4000,
  traceparent: string | null = null,
): OpsSource {
  return {
    async read(): Promise<OpsReading> {
      const fetchedAt = new Date();
      if (!settings) return { status: "unavailable", reason: "not_configured", fetchedAt };
      let response: Response;
      try {
        response = await fetcher(`${settings.url}/internal/v1/ops/summary`, {
          headers: {
            Authorization: `Bearer ${settings.token}`,
            Accept: "application/json",
            ...privateTraceHeader(traceparent),
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return { status: "unavailable", reason: "unreachable", fetchedAt };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return { status: "unavailable", reason: "rejected", fetchedAt };
      }
      try {
        const body = await readBounded(response, MAX_BYTES);
        return { status: "ok", summary: parseOpsSummary(JSON.parse(body)), fetchedAt };
      } catch {
        return { status: "unavailable", reason: "invalid", fetchedAt };
      }
    },
  };
}

/**
 * Reads the body incrementally and aborts as soon as it exceeds `maxBytes` bytes, whatever
 * Content-Length claims (chunked or lying responses included). Decodes UTF-8 strictly.
 */
export async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new OpsPayloadError("too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new OpsPayloadError("too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
