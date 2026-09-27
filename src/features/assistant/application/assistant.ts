/**
 * Conversation controller: a subscribable external store (read with useSyncExternalStore) that
 * owns the session and the single active run. Structure adapted from portfolio-assistant-web's
 * `createAssistant` (MIT, same author; see THIRD_PARTY_NOTICES.md): one lifetime AbortController
 * per mount, single-flight generation checked after every await, bounded cancellation, and no
 * automatic re-generation — a retry is always an explicit visitor action.
 */
import {
  type ConversationEvent,
  type ConversationState,
  canSubmit,
  initialState,
  reduce,
  type Turn,
} from "../domain/conversation.ts";
import { applyLinkPolicy, type LinkPolicy } from "../domain/links.ts";
import type { ErrorCode, Message, Page, RunEvent } from "../domain/models.ts";
import { AssistantError, type AssistantTransport, type Runtime } from "./ports.ts";

export type AssistantOptions = { policy: LinkPolicy };

type Generation = {
  controller: AbortController;
  key: string;
  runId: string | null;
  stopping: boolean;
  /** Set when the terminal event (or an authoritative answer) was applied. */
  settled: boolean;
};

const CANCEL_GRACE_MS = 5_000;

function codeOf(error: unknown): ErrorCode {
  return error instanceof AssistantError ? error.code : "network";
}

export function createAssistant(
  transport: AssistantTransport,
  runtime: Runtime,
  options: AssistantOptions,
) {
  let state: ConversationState = initialState;
  const listeners = new Set<() => void>();
  let lifetime = new AbortController();
  let opening: Promise<void> | null = null;
  let generation: Generation | null = null;
  let page: Page | null = null;

  function dispatch(event: ConversationEvent) {
    if (lifetime.signal.aborted) return;
    const next = reduce(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  const safe = (message: Message) => applyLinkPolicy(message, options.policy);

  /** Single-flight: concurrent callers (StrictMode, reconnect clicks) share one request. */
  function open(expired = false): Promise<void> {
    if (opening) return opening;
    const signal = lifetime.signal;
    dispatch({ type: "session.opening" });
    opening = transport
      .openSession(signal)
      .then((snapshot) => {
        if (signal.aborted) return;
        dispatch({
          type: "session.opened",
          messages: snapshot.messages.map(safe),
          availability: snapshot.availability,
          limits: snapshot.limits,
          expired,
        });
      })
      .catch((error: unknown) => {
        if (!signal.aborted) dispatch({ type: "session.failed", code: codeOf(error) });
      })
      .finally(() => {
        opening = null;
      });
    return opening;
  }

  function onRunEvent(current: Generation, event: RunEvent) {
    if (generation !== current || current.controller.signal.aborted) return;
    const key = current.key;
    switch (event.type) {
      case "started":
        current.runId = event.runId;
        dispatch({
          type: "run.started",
          key,
          runId: event.runId,
          question: event.userMessage ? safe(event.userMessage) : null,
        });
        // A stop requested before the run id was known is forwarded now.
        if (current.stopping) void requestCancel(current);
        return;
      case "delta":
        dispatch({ type: "run.delta", key, text: event.text });
        return;
      case "answer":
        current.settled = true;
        dispatch({ type: "run.answer", key, message: safe(event.message) });
        return;
      case "completed":
        current.settled = true;
        dispatch({ type: "run.completed", key });
        return;
      case "failed":
        current.settled = true;
        dispatch({ type: "run.failed", key, code: event.code, retryable: event.retryable });
        return;
      case "cancelled":
        current.settled = true;
        dispatch({ type: "run.cancelled", key });
        return;
    }
  }

  async function run(turn: Turn, allowFreshKey: boolean): Promise<void> {
    const current: Generation = {
      controller: new AbortController(),
      key: turn.key,
      runId: null,
      stopping: false,
      settled: false,
    };
    generation = current;
    const signal = AbortSignal.any([current.controller.signal, lifetime.signal]);
    try {
      const end = await transport.send(
        { content: turn.prompt, page, key: turn.key },
        signal,
        (event) => onRunEvent(current, event),
      );
      if (generation === current && !current.settled && end === "eof")
        dispatch({ type: "run.interrupted", key: turn.key });
    } catch (error) {
      if (generation !== current || lifetime.signal.aborted) return;
      if (current.controller.signal.aborted) {
        // Stopped by the visitor: the run may not have reported its own cancellation.
        if (!current.settled) dispatch({ type: "run.cancelled", key: turn.key });
        return;
      }
      const code = codeOf(error);
      if (current.runId || current.settled) {
        if (!current.settled) dispatch({ type: "run.interrupted", key: turn.key });
        return;
      }
      if (code === "idempotency_conflict" && allowFreshKey) {
        // The interrupted attempt ended as failed server-side: resend under a new key.
        generation = null;
        const fresh = { ...turn, key: runtime.id() };
        dispatch({ type: "turn.refused", key: turn.key, code });
        dispatch({ type: "turn.submitted", turn: fresh, question: null });
        return run(fresh, false);
      }
      dispatch({ type: "turn.refused", key: turn.key, code });
      if (code === "session_expired" || code === "csrf_failed") {
        generation = null;
        await open(code === "session_expired");
      }
    } finally {
      if (generation === current) generation = null;
    }
  }

  async function requestCancel(current: Generation) {
    if (!current.runId) return;
    const timeout = AbortSignal.timeout(CANCEL_GRACE_MS);
    try {
      await transport.cancelRun(current.runId, AbortSignal.any([lifetime.signal, timeout]));
    } catch {
      // Cancellation is best effort; the reader is released below either way.
    }
    // The stream normally ends with run.cancelled; stop waiting after the grace period.
    if (generation === current && !current.settled) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (generation === current && !current.settled) current.controller.abort();
    }
  }

  function submit(text: string): boolean {
    const prompt = text.trim();
    const max = state.limits?.maxMessageChars ?? 2000;
    if (!prompt || prompt.length > max || !canSubmit(state) || generation) return false;
    const turn: Turn = { key: runtime.id(), prompt, retry: false };
    const question: Message = {
      id: `local-${turn.key}`,
      role: "user",
      content: prompt,
      createdAt: runtime.now(),
      products: [],
      resources: [],
      links: [],
      sources: [],
      followUps: [],
      notices: [],
    };
    dispatch({ type: "turn.submitted", turn, question });
    void run(turn, false);
    return true;
  }

  function retry(): boolean {
    const outcome = state.outcome;
    if (!outcome || generation || !canSubmit(state)) return false;
    // After an interruption the same key may replay a completed answer; otherwise start afresh.
    const reuse = outcome.kind === "interrupted";
    const turn: Turn = {
      key: reuse ? outcome.turn.key : runtime.id(),
      prompt: outcome.turn.prompt,
      retry: true,
    };
    dispatch({ type: "turn.submitted", turn, question: null });
    void run(turn, reuse);
    return true;
  }

  function stop() {
    const current = generation;
    if (!current || current.stopping || current.settled) return;
    current.stopping = true;
    dispatch({ type: "run.stopping", key: current.key });
    if (current.runId) void requestCancel(current);
    else current.controller.abort();
  }

  async function clear() {
    if (generation || state.clearing || state.session !== "open") return;
    dispatch({ type: "clear.started" });
    try {
      await transport.deleteSession(lifetime.signal);
      dispatch({ type: "clear.finished", ok: true });
      await open();
    } catch (error) {
      if (lifetime.signal.aborted) return;
      if (codeOf(error) === "session_expired") {
        dispatch({ type: "clear.finished", ok: true });
        await open();
      } else dispatch({ type: "clear.finished", ok: false });
    }
  }

  function reconnect() {
    if (generation || state.session === "opening") return;
    void open();
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Idempotent: opening an already open session again does not issue a second request. */
    start() {
      if (lifetime.signal.aborted) {
        lifetime = new AbortController();
        state = initialState;
      }
      if (state.session === "open" || opening) return;
      void open();
    },
    dispose() {
      lifetime.abort();
      generation?.controller.abort();
      generation = null;
      opening = null;
    },
    setPage(next: Page | null) {
      page = next;
    },
    submit,
    retry,
    stop,
    clear,
    reconnect,
    dismiss: () => dispatch({ type: "outcome.dismissed" }),
  };
}

export type Assistant = ReturnType<typeof createAssistant>;
