// MOCK of the pequeverso-assistant-api v1 HTTP/SSE contract (pinned in contracts/source.json),
// for deterministic local and CI verification. It is not the real API and makes no model calls.
// Behavior copied from the pinned API: cookie session with in-memory CSRF token, Origin check on
// unsafe methods, error envelope, Idempotency-Key replay, SSE framing (`id`/`event`/`data`,
// message.completed followed by run.completed), cancel endpoint.
// Test-only control routes live under /__mock/ and are never proxied.
import { randomBytes } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import { scenario, type WireDetails } from "./fixtures.ts";

const COOKIE = "pv_assistant_dev";
const RETRYABLE = new Set([
  "busy",
  "provider_unavailable",
  "generation_failed",
  "timeout",
  "dependency_unavailable",
  "catalog_unavailable",
]);
const STATUS: Record<string, number> = {
  invalid_request: 422,
  origin_denied: 403,
  csrf_failed: 403,
  session_expired: 401,
  rate_limited: 429,
  busy: 503,
  run_in_progress: 409,
  idempotency_conflict: 409,
  run_not_found: 404,
  assistant_disabled: 503,
  budget_exhausted: 503,
  catalog_unavailable: 503,
};

type WireMessage = Omit<WireDetails, "content"> & {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};
type Run = {
  id: string;
  key: string;
  content: string;
  state: "active" | "completed" | "failed" | "cancelled";
  cancelled: boolean;
  answer: WireMessage | null;
};
type Session = {
  csrf: string;
  messages: WireMessage[];
  runs: Map<string, Run>;
  active: string | null;
};
type Availability = { status: "available" } | { status: "unavailable"; reason: string };
type Options = { port?: number; allowedOrigins?: string[]; storefront?: string };

const token = (bytes: number) => randomBytes(bytes).toString("base64url");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function message(
  role: WireMessage["role"],
  content: string,
  details: Partial<WireDetails> = {},
): WireMessage {
  return {
    id: `msg_${token(9)}`,
    role,
    content,
    created_at: new Date().toISOString(),
    products: [],
    resources: [],
    links: [],
    sources: [],
    follow_ups: [],
    notices: [],
    ...details,
  };
}

export function startMockApi({
  port = 8207,
  allowedOrigins = ["http://localhost:3207"],
  storefront = "http://localhost:3210",
}: Options = {}): Promise<Server> {
  const sessions = new Map<string, Session>(); // cookie secret -> session
  const control: { availability: Availability; sessionFailure: boolean; delayMs: number } = {
    availability: { status: "available" },
    sessionFailure: false,
    delayMs: 0,
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        ...headers,
      });
      res.end(JSON.stringify(body));
    };
    const error = (code: string) =>
      json(STATUS[code] ?? 503, {
        error: {
          code,
          message: code.replaceAll("_", " "),
          retryable: RETRYABLE.has(code),
          request_id: token(8),
        },
      });

    let raw = "";
    for await (const chunk of req) raw += String(chunk);
    if (raw.length > 16 * 1024) return error("invalid_request");

    if (url.pathname.startsWith("/__mock/")) {
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      if (url.pathname === "/__mock/reset") {
        sessions.clear();
        control.availability = { status: "available" };
        control.sessionFailure = false;
        control.delayMs = 0;
      }
      if (url.pathname === "/__mock/availability") control.availability = body as Availability;
      if (url.pathname === "/__mock/session-failure")
        control.sessionFailure = Boolean(body.enabled);
      if (url.pathname === "/__mock/delay") control.delayMs = Number(body.ms) || 0;
      if (url.pathname === "/__mock/expire") sessions.clear();
      return json(200, { ok: true });
    }

    if (
      ["POST", "PATCH", "DELETE", "PUT"].includes(req.method ?? "") &&
      !allowedOrigins.includes(req.headers.origin ?? "")
    )
      return error("origin_denied");

    const secret = req.headers.cookie?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
    let session = secret ? sessions.get(secret) : undefined;
    const setCookie = (value: string) =>
      `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`;

    if (url.pathname === "/api/v1/session" && req.method === "POST") {
      if (req.headers["content-type"]?.split(";")[0] !== "application/json")
        return error("invalid_request");
      if (control.delayMs) await sleep(control.delayMs);
      if (control.sessionFailure) return error("dependency_unavailable");
      let created = false;
      let cookie = secret;
      if (!session || !cookie) {
        cookie = token(32);
        session = { csrf: token(24), messages: [], runs: new Map(), active: null };
        sessions.set(cookie, session);
        created = true;
      }
      return json(
        created ? 201 : 200,
        {
          schema_version: "1",
          csrf_token: session.csrf,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          created,
          messages: session.messages,
          availability: { reason: null, ...control.availability },
          limits: { max_message_chars: 600, messages_per_day: 30 },
        },
        { "set-cookie": setCookie(cookie) },
      );
    }

    if (!session || !secret) return error("session_expired");
    if (req.headers["x-csrf-token"] !== session.csrf) return error("csrf_failed");

    if (url.pathname === "/api/v1/session" && req.method === "DELETE") {
      sessions.delete(secret);
      res.writeHead(204, { "set-cookie": `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` });
      return res.end();
    }

    const cancel = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/cancel$/);
    if (cancel?.[1] && req.method === "POST") {
      const run = session.runs.get(decodeURIComponent(cancel[1]));
      if (run?.state !== "active") return error("run_not_found");
      run.cancelled = true;
      res.writeHead(202);
      return res.end();
    }

    if (url.pathname === "/api/v1/messages" && req.method === "POST")
      return stream(req.headers, raw, session, secret, res);

    return json(404, {
      error: { code: "not_found", message: "Not found.", retryable: false, request_id: token(8) },
    });

    async function stream(
      headers: typeof req.headers,
      body: string,
      current: Session,
      cookie: string,
      out: ServerResponse,
    ) {
      const key = String(headers["idempotency-key"] ?? "");
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return error("invalid_request");
      let parsed: { content?: unknown; page?: unknown };
      try {
        parsed = JSON.parse(body) as typeof parsed;
      } catch {
        return error("invalid_request");
      }
      const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
      if (
        !content ||
        content.length > 600 ||
        !["home", "product", "support", null, undefined].includes(parsed.page as string)
      )
        return error("invalid_request");
      if (control.availability.status !== "available") return error(control.availability.reason);
      const existing = [...current.runs.values()].find((run) => run.key === key);
      if (existing) {
        if (existing.content !== content || existing.state !== "completed")
          return error(existing.state === "active" ? "run_in_progress" : "idempotency_conflict");
      } else if (current.active) return error("run_in_progress");

      const plan = existing ? null : scenario(content, storefront);
      if (plan?.refuse) {
        if (plan.refuse.code === "session_expired") sessions.delete(cookie);
        return error(plan.refuse.code);
      }

      const run: Run = existing ?? {
        id: `run_${token(9)}`,
        key,
        content,
        state: "active",
        cancelled: false,
        answer: null,
      };
      current.runs.set(run.id, run);
      out.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-store, no-transform",
        "x-accel-buffering": "no",
        "x-run-id": run.id,
      });
      let sequence = 0;
      const send = (type: string, fields: Record<string, unknown> = {}) => {
        const event = {
          schema_version: "1",
          run_id: run.id,
          sequence,
          timestamp: new Date().toISOString(),
          type,
          ...fields,
        };
        out.write(`id: ${sequence}\r\nevent: ${type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`);
        sequence += 1;
      };
      let closed = false;
      out.on("close", () => {
        closed = true;
        if (run.state === "active") run.state = "cancelled";
        if (current.active === run.id) current.active = null;
      });
      const settle = (state: Run["state"]) => {
        run.state = state;
        current.active = null;
      };

      if (existing) {
        // Idempotent replay of a completed run: stored answer, no stored question.
        send("run.started", { user_message: null });
        send("message.completed", { message: run.answer });
        send("run.completed");
        return out.end();
      }
      if (!plan) return out.end();

      current.active = run.id;
      const question = message("user", plan.question ?? content);
      current.messages.push(question);
      send("run.started", { user_message: question });
      const chunks = plan.chunks ?? plan.answer?.content.match(/[\s\S]{1,24}/g) ?? [];
      const pause = plan.slow || 25;
      for (const chunk of chunks) {
        await sleep(pause);
        if (closed) return;
        if (run.cancelled) {
          settle("cancelled");
          send("run.cancelled");
          return out.end();
        }
        send("message.delta", { text: chunk });
      }
      if (plan.eof) {
        settle("failed");
        // Let the last delta flush, then drop the connection without a terminal event.
        await sleep(100);
        return out.destroy();
      }
      if (plan.fail) {
        settle("failed");
        send("run.failed", plan.fail);
        return out.end();
      }
      await sleep(pause);
      if (closed) return;
      if (run.cancelled) {
        settle("cancelled");
        send("run.cancelled");
        return out.end();
      }
      const { content: planned = "", ...lists } = plan.answer ?? {};
      const answer = message("assistant", planned || chunks.join(""), lists);
      current.messages.push(answer);
      run.answer = answer;
      settle("completed");
      send("message.completed", { message: answer });
      send("run.completed");
      return out.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.main) {
  const server = await startMockApi();
  const stop = () => {
    server.closeAllConnections();
    server.close();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
