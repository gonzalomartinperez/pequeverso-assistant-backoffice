import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ConversationEvent,
  type ConversationState,
  canSubmit,
  initialState,
  reduce,
  type Turn,
} from "../../src/features/assistant/domain/conversation.ts";
import type { Message } from "../../src/features/assistant/domain/models.ts";

const message = (id: string, role: Message["role"], content = id): Message => ({
  id,
  role,
  content,
  createdAt: "2026-09-27T12:00:00Z",
  products: [],
  resources: [],
  links: [],
  sources: [],
  followUps: [],
  notices: [],
});

const open = (messages: Message[] = []): ConversationState =>
  reduce(initialState, {
    type: "session.opened",
    messages,
    availability: { status: "available" },
    limits: { maxMessageChars: 600, messagesPerDay: 30 },
    expired: false,
  });

const run = (state: ConversationState, ...events: ConversationEvent[]) =>
  events.reduce(reduce, state);
const turn = (key = "key-00001", retry = false): Turn => ({ key, prompt: "¿Qué incluye?", retry });

describe("conversation reducer", () => {
  it("streams, then replaces the draft with the authoritative answer", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local-1", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: message("msg_q", "user") },
      { type: "run.delta", key: "key-00001", text: "Hola" },
      { type: "run.delta", key: "key-00001", text: " mundo" },
    );
    assert.equal(state.pending?.draft, "Hola mundo");
    assert.deepEqual(
      state.messages.map((m) => m.id),
      ["msg_q"],
      "the stored question replaces the optimistic one",
    );
    const done = run(
      state,
      { type: "run.answer", key: "key-00001", message: message("msg_a", "assistant", "Final") },
      { type: "run.completed", key: "key-00001" },
    );
    assert.equal(done.pending, null);
    assert.deepEqual(
      done.messages.map((m) => m.id),
      ["msg_q", "msg_a"],
    );
    assert.ok(canSubmit(done));
  });

  it("ignores events from a different (stale) turn key", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn("current-1"), question: message("local", "user") },
      { type: "run.started", key: "stale-000", runId: "run_old", question: null },
      { type: "run.delta", key: "stale-000", text: "late" },
      { type: "run.answer", key: "stale-000", message: message("old", "assistant") },
    );
    assert.equal(state.pending?.runId, null);
    assert.equal(state.pending?.draft, "");
    assert.equal(state.messages.length, 0);
  });

  it("allows only one pending turn (rapid double submit is a no-op)", () => {
    const first = run(open(), {
      type: "turn.submitted",
      turn: turn("a-000001"),
      question: message("l1", "user"),
    });
    const second = reduce(first, {
      type: "turn.submitted",
      turn: turn("b-000001"),
      question: message("l2", "user"),
    });
    assert.equal(second, first);
    assert.equal(canSubmit(first), false);
  });

  it("returns a refused question to the composer and removes the optimistic bubble", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "turn.refused", key: "key-00001", code: "busy" },
    );
    assert.equal(state.pending, null);
    assert.equal(state.messages.length, 0);
    assert.equal(state.refusal, "busy");
    assert.equal(state.restore?.text, "¿Qué incluye?");
  });

  it("keeps partial text on interruption and offers retry with the same turn", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: message("q", "user") },
      { type: "run.delta", key: "key-00001", text: "Parcial" },
      { type: "run.interrupted", key: "key-00001" },
    );
    assert.equal(state.outcome?.kind, "interrupted");
    assert.equal(state.outcome?.partial, "Parcial");
    assert.equal(state.outcome?.turn.key, "key-00001");
    assert.equal(state.messages.length, 1, "the stored question stays");
  });

  it("does not duplicate the question bubble on retry", () => {
    const failed = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: message("q1", "user") },
      { type: "run.failed", key: "key-00001", code: "generation_failed", retryable: true },
    );
    const retried = run(
      failed,
      { type: "turn.submitted", turn: turn("key-00002", true), question: null },
      { type: "run.started", key: "key-00002", runId: "run_2", question: message("q2", "user") },
    );
    assert.deepEqual(
      retried.messages.map((m) => m.id),
      ["q2"],
    );
  });

  it("treats a missing terminal event after the answer as complete", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: null },
      { type: "run.answer", key: "key-00001", message: message("a", "assistant") },
      { type: "run.interrupted", key: "key-00001" },
    );
    assert.equal(state.outcome, null);
    assert.equal(state.pending, null);
  });

  it("run.completed without an answer is an interruption, not a success", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: null },
      { type: "run.completed", key: "key-00001" },
    );
    assert.equal(state.outcome?.kind, "interrupted");
  });

  it("budget exhaustion makes the assistant unavailable for new questions", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: null },
      { type: "run.failed", key: "key-00001", code: "budget_exhausted", retryable: false },
    );
    assert.deepEqual(state.availability, { status: "unavailable", reason: "budget_exhausted" });
    assert.equal(canSubmit(state), false);
    assert.equal(state.outcome, null, "the unavailable notice alone explains it");
  });

  it("ignores deltas after stop was requested", () => {
    const state = run(
      open(),
      { type: "turn.submitted", turn: turn(), question: message("local", "user") },
      { type: "run.started", key: "key-00001", runId: "run_1", question: null },
      { type: "run.delta", key: "key-00001", text: "Uno" },
      { type: "run.stopping", key: "key-00001" },
      { type: "run.delta", key: "key-00001", text: " dos" },
      { type: "run.cancelled", key: "key-00001" },
    );
    assert.equal(state.outcome?.kind, "cancelled");
    assert.equal(state.outcome?.partial, "Uno");
  });

  it("marks an expired reopen and clears history", () => {
    const state = reduce(open([message("old", "user")]), {
      type: "session.opened",
      messages: [],
      availability: { status: "available" },
      limits: { maxMessageChars: 600, messagesPerDay: 30 },
      expired: true,
    });
    assert.equal(state.notice, "expired");
    assert.equal(state.messages.length, 0);
  });
});
