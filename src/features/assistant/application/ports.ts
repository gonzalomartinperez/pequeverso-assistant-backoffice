import type { ErrorCode, Page, RunEvent, SessionSnapshot } from "../domain/models.ts";

/** A refusal or failure with the API's code; `retryable` follows the API's own classification. */
export class AssistantError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  constructor(code: ErrorCode, retryable = false) {
    super(code);
    this.name = "AssistantError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type SendInput = { content: string; page: Page | null; key: string };

/** How a stream ended: after its terminal event, or at EOF without one (interrupted). */
export type StreamEnd = "terminal" | "eof";

/** Small port over the HTTP/SSE contract; adapters/http.ts is the only production implementation. */
export interface AssistantTransport {
  /** Restores the cookie-bound session or creates one. Holds the CSRF token internally. */
  openSession(signal: AbortSignal): Promise<SessionSnapshot>;
  /** Deletes the session and its whole conversation. */
  deleteSession(signal: AbortSignal): Promise<void>;
  /** Refusals before the stream opens reject with AssistantError; events are validated. */
  send(
    input: SendInput,
    signal: AbortSignal,
    onEvent: (event: RunEvent) => void,
  ): Promise<StreamEnd>;
  cancelRun(runId: string, signal: AbortSignal): Promise<void>;
}

export interface Runtime {
  /** Unique id usable as an Idempotency-Key (`^[A-Za-z0-9_-]{8,128}$`). */
  id(): string;
  now(): string;
}
