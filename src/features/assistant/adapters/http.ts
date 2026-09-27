/**
 * HTTP/SSE transport for pequeverso-assistant-api v1 (routes in `app/presentation/http.py`).
 * Same-origin by default: the proxy routes `/api/*` to the API unchanged, so the session cookie
 * is first-party and no API origin is configured in the browser. The CSRF token lives only in
 * this closure — never in storage, URLs or postMessage.
 */
import { AssistantError, type AssistantTransport } from "../application/ports.ts";
import { ERROR_CODES, type ErrorCode, type RunEvent } from "../domain/models.ts";
import { readSse, StreamProtocolError, type WireEvent } from "./sse.ts";
import { PayloadError, parseErrorBody, parseSession } from "./validate.ts";

function knownCode(value: string): ErrorCode | null {
  return ERROR_CODES.find((code) => code === value) ?? null;
}

async function errorFrom(response: Response): Promise<AssistantError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error bodies (proxy pages) fall through to the status mapping.
  }
  const parsed = parseErrorBody(body);
  const code = parsed ? knownCode(parsed.code) : null;
  if (code && parsed) return new AssistantError(code, parsed.retryable);
  if (response.status === 401) return new AssistantError("session_expired");
  if (response.status === 429) return new AssistantError("rate_limited", true);
  if (response.status >= 500) return new AssistantError("dependency_unavailable", true);
  return new AssistantError("invalid_request");
}

function toRunEvent(event: WireEvent): RunEvent {
  switch (event.type) {
    case "run.started":
      return { type: "started", runId: event.runId, userMessage: event.userMessage };
    case "message.delta":
      return { type: "delta", text: event.text };
    case "message.completed":
      return { type: "answer", message: event.message };
    case "run.completed":
      return { type: "completed" };
    case "run.failed":
      return { type: "failed", code: event.code, retryable: event.retryable };
    case "run.cancelled":
      return { type: "cancelled" };
  }
}

export function createHttpTransport(base = "", fetcher: typeof fetch = fetch): AssistantTransport {
  let csrf: string | null = null;

  async function request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(`${base}${path}`, {
        ...init,
        signal,
        credentials: "include",
        cache: "no-store",
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(csrf && init.method && init.method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new AssistantError("network", true);
    }
    if (!response.ok) {
      const error = await errorFrom(response);
      if (error.code === "session_expired") csrf = null;
      throw error;
    }
    return response;
  }

  return {
    async openSession(signal) {
      const response = await request("/api/v1/session", signal, { method: "POST", body: "{}" });
      try {
        const session = parseSession(await response.json());
        csrf = session.csrfToken;
        return session;
      } catch (error) {
        if (signal.aborted) throw error;
        throw new AssistantError("protocol");
      }
    },
    async deleteSession(signal) {
      const response = await request("/api/v1/session", signal, { method: "DELETE" });
      await response.body?.cancel().catch(() => {});
      csrf = null;
    },
    async send({ content, page, key }, signal, onEvent) {
      const response = await request("/api/v1/messages", signal, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ content, page }),
      });
      if (
        !response.body ||
        !response.headers.get("content-type")?.startsWith("text/event-stream")
      ) {
        await response.body?.cancel().catch(() => {});
        throw new AssistantError("protocol");
      }
      try {
        const terminal = await readSse(
          response.body,
          (event) => onEvent(toRunEvent(event)),
          signal,
        );
        return terminal ? "terminal" : "eof";
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof StreamProtocolError || error instanceof PayloadError)
          throw new AssistantError("protocol");
        throw new AssistantError("network", true);
      }
    },
    async cancelRun(runId, signal) {
      const response = await request(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, signal, {
        method: "POST",
      });
      await response.body?.cancel().catch(() => {});
    },
  };
}
