/**
 * Conversation state as a pure reducer. The application layer feeds it events from the session
 * and run transports; presentation only reads the resulting state. Every run event carries the
 * turn key so late events from a stopped, cleared or superseded run are ignored here as well as
 * in the controller.
 */
import type { Availability, ErrorCode, Limits, Message } from "./models.ts";

export type Turn = {
  /** Idempotency-Key of the current attempt. */
  key: string;
  prompt: string;
  /** Retries re-send a question already shown in the transcript. */
  retry: boolean;
};

export type Pending = {
  turn: Turn;
  runId: string | null;
  /** Optimistic question, shown until the API confirms the stored (possibly redacted) one. */
  question: Message | null;
  /** Provisional streamed text; replaced by the authoritative answer. */
  draft: string;
  answered: boolean;
  stopping: boolean;
};

export type Outcome =
  | { kind: "failed"; code: ErrorCode; retryable: boolean; partial: string; turn: Turn }
  | { kind: "cancelled"; partial: string; turn: Turn }
  | { kind: "interrupted"; partial: string; turn: Turn };

export type Notice = "expired" | "rejected" | null;

export type ConversationState = {
  session: "opening" | "open" | "failed";
  sessionError: ErrorCode | null;
  availability: Availability;
  limits: Limits | null;
  messages: Message[];
  pending: Pending | null;
  outcome: Outcome | null;
  /** Question text returned to the composer after a refusal; `nonce` makes repeats observable. */
  restore: { text: string; nonce: number } | null;
  notice: Notice;
  /** Error of a request refused before streaming (shown inline, not as an outcome). */
  refusal: ErrorCode | null;
  clearing: boolean;
};

export type ConversationEvent =
  | { type: "session.opening" }
  | {
      type: "session.opened";
      messages: Message[];
      availability: Availability;
      limits: Limits;
      expired: boolean;
    }
  | { type: "session.failed"; code: ErrorCode }
  | { type: "turn.submitted"; turn: Turn; question: Message | null }
  | { type: "turn.refused"; key: string; code: ErrorCode }
  | { type: "run.started"; key: string; runId: string; question: Message | null }
  | { type: "run.delta"; key: string; text: string }
  | { type: "run.answer"; key: string; message: Message }
  | { type: "run.completed"; key: string }
  | { type: "run.failed"; key: string; code: ErrorCode; retryable: boolean }
  | { type: "run.cancelled"; key: string }
  | { type: "run.interrupted"; key: string }
  | { type: "run.stopping"; key: string }
  | { type: "availability"; availability: Availability }
  | { type: "outcome.dismissed" }
  | { type: "clear.started" }
  | { type: "clear.finished"; ok: boolean };

export const initialState: ConversationState = {
  session: "opening",
  sessionError: null,
  availability: { status: "available" },
  limits: null,
  messages: [],
  pending: null,
  outcome: null,
  restore: null,
  notice: null,
  refusal: null,
  clearing: false,
};

/** Codes that make the assistant unavailable for new questions until the session reopens. */
const UNAVAILABLE: Partial<Record<ErrorCode, Availability>> = {
  assistant_disabled: { status: "unavailable", reason: "assistant_disabled" },
  budget_exhausted: { status: "unavailable", reason: "budget_exhausted" },
  catalog_unavailable: { status: "unavailable", reason: "catalog_unavailable" },
};

export function canSubmit(state: ConversationState): boolean {
  return (
    state.session === "open" &&
    state.availability.status === "available" &&
    state.pending === null &&
    !state.clearing
  );
}

export function isRunning(state: ConversationState): boolean {
  return state.pending !== null;
}

function current(state: ConversationState, key: string): Pending | null {
  return state.pending && state.pending.turn.key === key ? state.pending : null;
}

function withQuestion(messages: Message[], pending: Pending, stored: Message | null): Message[] {
  const question = stored ?? pending.question;
  if (!question) return messages;
  if (pending.turn.retry) {
    // A retry re-sends the last question: keep one bubble, adopting the stored copy if given.
    const index = messages.findLastIndex((m) => m.role === "user");
    if (index >= 0 && stored) return messages.map((m, i) => (i === index ? stored : m));
    return messages;
  }
  return [...messages, question];
}

function unavailableFor(code: ErrorCode, fallback: Availability): Availability {
  return UNAVAILABLE[code] ?? fallback;
}

export function reduce(state: ConversationState, event: ConversationEvent): ConversationState {
  switch (event.type) {
    case "session.opening":
      return { ...state, session: "opening", sessionError: null };
    case "session.opened":
      return {
        ...state,
        session: "open",
        sessionError: null,
        availability: event.availability,
        limits: event.limits,
        messages: event.messages,
        pending: null,
        outcome: null,
        notice: event.expired ? "expired" : state.notice === "expired" ? null : state.notice,
        // The expired notice already explains the refused question; don't repeat it as an error.
        refusal: event.expired ? null : state.refusal,
        clearing: false,
      };
    case "session.failed":
      return {
        ...state,
        session: "failed",
        sessionError: event.code,
        availability: unavailableFor(event.code, state.availability),
        pending: null,
      };
    case "turn.submitted":
      if (!canSubmit(state)) return state;
      return {
        ...state,
        pending: {
          turn: event.turn,
          runId: null,
          question: event.question,
          draft: "",
          answered: false,
          stopping: false,
        },
        outcome: null,
        refusal: null,
        notice: null,
      };
    case "turn.refused": {
      const pending = current(state, event.key);
      if (!pending) return state;
      return {
        ...state,
        pending: null,
        refusal: event.code,
        availability: unavailableFor(event.code, state.availability),
        // A refused first attempt returns the question to the composer; a refused retry keeps
        // the outcome so the visitor can try again later.
        restore: pending.turn.retry
          ? state.restore
          : { text: pending.turn.prompt, nonce: (state.restore?.nonce ?? 0) + 1 },
        outcome: pending.turn.retry ? state.outcome : null,
      };
    }
    case "run.started": {
      const pending = current(state, event.key);
      if (!pending || pending.runId) return state;
      return {
        ...state,
        messages: withQuestion(state.messages, pending, event.question),
        pending: { ...pending, runId: event.runId, question: null },
      };
    }
    case "run.delta": {
      const pending = current(state, event.key);
      if (!pending || pending.answered || pending.stopping) return state;
      return { ...state, pending: { ...pending, draft: pending.draft + event.text } };
    }
    case "run.answer": {
      const pending = current(state, event.key);
      if (!pending || pending.answered) return state;
      return {
        ...state,
        messages: [...state.messages, event.message],
        pending: { ...pending, draft: "", answered: true },
      };
    }
    case "run.completed": {
      const pending = current(state, event.key);
      if (!pending) return state;
      if (!pending.answered) return reduce(state, { type: "run.interrupted", key: event.key });
      return { ...state, pending: null };
    }
    case "run.failed": {
      const pending = current(state, event.key);
      if (!pending) return state;
      if (pending.answered) return { ...state, pending: null };
      const availability = unavailableFor(event.code, state.availability);
      const messages = pending.runId ? state.messages : withQuestion(state.messages, pending, null);
      // The unavailable notice already explains an unavailability failure with nothing to keep.
      if (availability.status === "unavailable" && !pending.draft)
        return { ...state, messages, pending: null, availability, outcome: null };
      return {
        ...state,
        messages,
        pending: null,
        availability,
        outcome: {
          kind: "failed",
          code: event.code,
          retryable: event.retryable,
          partial: pending.draft,
          turn: pending.turn,
        },
      };
    }
    case "run.cancelled":
    case "run.interrupted": {
      const pending = current(state, event.key);
      if (!pending) return state;
      // An authoritative answer already arrived: a missing terminal event loses nothing.
      if (pending.answered) return { ...state, pending: null };
      return {
        ...state,
        messages: pending.runId ? state.messages : withQuestion(state.messages, pending, null),
        pending: null,
        outcome: {
          kind: event.type === "run.cancelled" ? "cancelled" : "interrupted",
          partial: pending.draft,
          turn: pending.turn,
        },
      };
    }
    case "run.stopping": {
      const pending = current(state, event.key);
      if (!pending || pending.answered) return state;
      return { ...state, pending: { ...pending, stopping: true } };
    }
    case "availability":
      return { ...state, availability: event.availability };
    case "outcome.dismissed":
      return { ...state, outcome: null, refusal: null, notice: null };
    case "clear.started":
      return state.pending ? state : { ...state, clearing: true };
    case "clear.finished":
      return event.ok
        ? { ...state, clearing: false, messages: [], outcome: null, refusal: null, notice: null }
        : { ...state, clearing: false, refusal: "network" };
  }
}
