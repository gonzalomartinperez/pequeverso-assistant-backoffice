import type { OpsReading, OpsSource } from "../application/ports.ts";
import { OpsPayloadError, parseOpsSummary } from "./validate.ts";

const MAX_BYTES = 256 * 1024;

/**
 * Server-to-server client for `GET {OPS_API_URL}/internal/v1/ops/summary` with a bearer token.
 * Never cached, bounded in time and size, no redirects followed. Every failure collapses into an
 * "unavailable" reading without details that could leak configuration to the page.
 */
export function httpOpsSource(
  settings: { url: string; token: string } | null,
  fetcher: typeof fetch = fetch,
  timeoutMs = 4000,
): OpsSource {
  return {
    async read(): Promise<OpsReading> {
      const fetchedAt = new Date();
      if (!settings) return { status: "unavailable", reason: "not_configured", fetchedAt };
      let response: Response;
      try {
        response = await fetcher(`${settings.url}/internal/v1/ops/summary`, {
          headers: { Authorization: `Bearer ${settings.token}`, Accept: "application/json" },
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
