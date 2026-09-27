/**
 * Bounded Server-Sent Events reader for `POST /api/v1/messages` (fetch body, not EventSource,
 * because the request is a credentialed POST with headers). Framing, UTF-8 and size bounds are
 * adapted from portfolio-assistant-web's reader (MIT, same author); the event vocabulary follows
 * pequeverso-assistant-api `app/presentation/events.py` (schema_version "1").
 */

import type { ErrorCode, Message } from "../domain/models.ts";
import { ERROR_CODES } from "../domain/models.ts";
import { parseMessage, record } from "./validate.ts";

export type WireEvent =
  | { type: "run.started"; runId: string; sequence: number; userMessage: Message | null }
  | { type: "message.delta"; runId: string; sequence: number; text: string }
  | { type: "message.completed"; runId: string; sequence: number; message: Message }
  | { type: "run.completed"; runId: string; sequence: number }
  | { type: "run.failed"; runId: string; sequence: number; code: ErrorCode; retryable: boolean }
  | { type: "run.cancelled"; runId: string; sequence: number };

const TERMINAL = new Set<WireEvent["type"]>(["run.completed", "run.failed", "run.cancelled"]);
const MAX_FRAME = 64_000;
const MAX_TOTAL_BYTES = 1_000_000;
const MAX_DELTA = 16_000;

export class StreamProtocolError extends Error {
  override readonly name = "StreamProtocolError";
}

/** No bytes (not even a keep-alive comment) arrived within the idle window. */
export class StreamStalledError extends Error {
  override readonly name = "StreamStalledError";
}

/**
 * The API sends a keep-alive comment after 15 s of silence (`heartbeat_seconds`), so three missed
 * heartbeats mean the connection is dead even if no transport error was raised (e.g. an upstream
 * proxy that stopped forwarding without closing the client connection).
 */
export const DEFAULT_IDLE_MS = 45_000;

function fail(reason: string): never {
  throw new StreamProtocolError(reason);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const BASE = ["schema_version", "run_id", "sequence", "timestamp", "type"] as const;

/** Validates one decoded event; unknown fields, types or shapes are protocol errors. */
export function validateEvent(value: unknown, frameType: string): WireEvent {
  if (!record(value)) return fail("event is not an object");
  const { schema_version, run_id, sequence, timestamp, type } = value;
  if (
    schema_version !== "1" ||
    typeof run_id !== "string" ||
    run_id.length === 0 ||
    run_id.length > 128 ||
    typeof sequence !== "number" ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    typeof timestamp !== "string" ||
    typeof type !== "string" ||
    type !== frameType
  )
    return fail("invalid event envelope");
  const base = { runId: run_id, sequence };
  switch (type) {
    case "run.started": {
      if (!exactKeys(value, [...BASE, "user_message"])) return fail("invalid run.started");
      const userMessage = value.user_message === null ? null : parseMessage(value.user_message);
      return { type, ...base, userMessage };
    }
    case "message.delta":
      if (
        !exactKeys(value, [...BASE, "text"]) ||
        typeof value.text !== "string" ||
        value.text.length > MAX_DELTA
      )
        return fail("invalid message.delta");
      return { type, ...base, text: value.text };
    case "message.completed":
      if (!exactKeys(value, [...BASE, "message"])) return fail("invalid message.completed");
      return { type, ...base, message: parseMessage(value.message) };
    case "run.completed":
    case "run.cancelled":
      if (!exactKeys(value, BASE)) return fail(`invalid ${type}`);
      return { type, ...base };
    case "run.failed": {
      const code = ERROR_CODES.find((known) => known === value.code);
      if (!exactKeys(value, [...BASE, "code", "retryable"]) || typeof value.retryable !== "boolean")
        return fail("invalid run.failed");
      // An unknown failure code is still a failure; classify it conservatively.
      return { type, ...base, code: code ?? "generation_failed", retryable: value.retryable };
    }
    default:
      return fail("unknown event type");
  }
}

/**
 * Reads frames until a terminal event or EOF. Returns whether a terminal event was seen.
 * Comment frames (`: keep-alive`) are ignored and consume no sequence number.
 */
export async function readSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: WireEvent) => void,
  signal?: AbortSignal,
  idleMs = DEFAULT_IDLE_MS,
): Promise<boolean> {
  const reader = stream.getReader();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const read = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      idle = setTimeout(() => reject(new StreamStalledError("stream stalled")), idleMs);
      reader.read().then(resolve, reject);
    }).finally(() => clearTimeout(idle));
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let terminal = false;
  let total = 0;
  let lastSequence = -1;
  let runId: string | null = null;
  try {
    while (!terminal) {
      signal?.throwIfAborted();
      const { value, done } = await read();
      signal?.throwIfAborted();
      total += value?.byteLength ?? 0;
      if (total > MAX_TOTAL_BYTES) fail("stream too large");
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      if (buffer.length > MAX_FRAME) fail("frame too large");
      for (const frame of frames) {
        if (frame.length > MAX_FRAME) fail("frame too large");
        let frameType = "";
        const data: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith("event:")) frameType = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        if (!data.length) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.join("\n"));
        } catch {
          fail("event data is not JSON");
        }
        const event = validateEvent(parsed, frameType);
        if (terminal || event.sequence <= lastSequence || (runId !== null && event.runId !== runId))
          fail("invalid event order");
        lastSequence = event.sequence;
        runId = event.runId;
        terminal = TERMINAL.has(event.type);
        onEvent(event);
        if (terminal) break;
      }
      if (done) break;
    }
    if (!terminal && buffer.trim()) fail("incomplete frame");
    return terminal;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
