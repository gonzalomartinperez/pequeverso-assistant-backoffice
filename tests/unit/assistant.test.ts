import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAssistant } from "../../src/features/assistant/application/assistant.ts";
import {
  AssistantError,
  type AssistantTransport,
  type SendInput,
} from "../../src/features/assistant/application/ports.ts";
import type {
  Message,
  RunEvent,
  SessionSnapshot,
} from "../../src/features/assistant/domain/models.ts";

const policy = { storefrontOrigin: "https://pequeverso.com", linkHosts: [] };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

const snapshot = (messages: Message[] = []): SessionSnapshot => ({
  csrfToken: "csrf",
  expiresAt: "2026-09-28T12:00:00Z",
  created: messages.length === 0,
  messages,
  availability: { status: "available" },
  limits: { maxMessageChars: 600, messagesPerDay: 30 },
});

type Script = (
  input: SendInput,
  signal: AbortSignal,
  emit: (event: RunEvent) => void,
) => Promise<"terminal" | "eof">;

function fixture(script: Script, overrides: Partial<AssistantTransport> = {}) {
  const calls = { open: 0, send: [] as SendInput[], cancel: [] as string[], delete: 0 };
  let ids = 0;
  const transport: AssistantTransport = {
    async openSession() {
      calls.open++;
      return snapshot();
    },
    async deleteSession() {
      calls.delete++;
    },
    send(input, signal, onEvent) {
      calls.send.push(input);
      return script(input, signal, onEvent);
    },
    async cancelRun(runId) {
      calls.cancel.push(runId);
    },
    ...overrides,
  };
  const assistant = createAssistant(
    transport,
    { id: () => `key-${String(++ids).padStart(6, "0")}`, now: () => "2026-09-27T12:00:00Z" },
    { policy },
  );
  return { assistant, calls };
}

const answering: Script = async (_input, _signal, emit) => {
  emit({ type: "started", runId: "run_1", userMessage: message("q", "user") });
  emit({ type: "delta", text: "Hola" });
  emit({ type: "answer", message: message("a", "assistant", "Hola") });
  emit({ type: "completed" });
  return "terminal";
};

describe("assistant controller", () => {
  it("opens the session once even when started repeatedly (reopen without duplicate requests)", async () => {
    const { assistant, calls } = fixture(answering);
    assistant.start();
    assistant.start();
    await tick();
    assistant.start();
    await tick();
    assert.equal(calls.open, 1);
    assert.equal(assistant.getSnapshot().session, "open");
  });

  it("sends one question at a time with a fresh idempotency key and the host page", async () => {
    const { assistant, calls } = fixture(answering);
    assistant.start();
    await tick();
    assistant.setPage("product");
    assert.equal(assistant.submit("  ¿Qué incluye?  "), true);
    assert.equal(assistant.submit("otra"), false, "rapid second submit is refused");
    await tick();
    assert.deepEqual(calls.send, [
      { content: "¿Qué incluye?", page: "product", key: "key-000001" },
    ]);
    assert.deepEqual(
      assistant.getSnapshot().messages.map((m) => m.id),
      ["q", "a"],
    );
  });

  it("refuses empty and over-limit questions locally", async () => {
    const { assistant, calls } = fixture(answering);
    assistant.start();
    await tick();
    assert.equal(assistant.submit("   "), false);
    assert.equal(assistant.submit("x".repeat(601)), false);
    assert.equal(calls.send.length, 0);
  });

  it("stop forwards cancellation for a known run and settles as cancelled", async () => {
    const release = deferred<void>();
    const { assistant, calls } = fixture(async (_input, signal, emit) => {
      emit({ type: "started", runId: "run_9", userMessage: null });
      emit({ type: "delta", text: "Parcial" });
      await Promise.race([
        release.promise,
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
      ]);
      emit({ type: "cancelled" });
      return "terminal";
    });
    assistant.start();
    await tick();
    assistant.submit("lento");
    await tick();
    assistant.stop();
    await tick();
    assert.deepEqual(calls.cancel, ["run_9"]);
    release.resolve();
    await tick();
    const state = assistant.getSnapshot();
    assert.equal(state.pending, null);
    assert.equal(state.outcome?.kind, "cancelled");
    assert.equal(state.outcome?.partial, "Parcial");
  });

  it("stop before the run id is known aborts the request", async () => {
    const { assistant, calls } = fixture(
      (_input, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
    );
    assistant.start();
    await tick();
    assistant.submit("hola");
    assistant.stop();
    await tick();
    assert.equal(calls.cancel.length, 0);
    assert.equal(assistant.getSnapshot().outcome?.kind, "cancelled");
  });

  it("marks EOF without a terminal event as interrupted and retries with the same key", async () => {
    let attempt = 0;
    const { assistant, calls } = fixture(async (_input, _signal, emit) => {
      attempt++;
      if (attempt === 1) {
        emit({ type: "started", runId: "run_1", userMessage: message("q", "user") });
        emit({ type: "delta", text: "Medio" });
        return "eof";
      }
      emit({ type: "started", runId: "run_1", userMessage: null });
      emit({ type: "answer", message: message("a", "assistant") });
      emit({ type: "completed" });
      return "terminal";
    });
    assistant.start();
    await tick();
    assistant.submit("hola");
    await tick();
    assert.equal(assistant.getSnapshot().outcome?.kind, "interrupted");
    assert.equal(assistant.retry(), true);
    await tick();
    assert.equal(calls.send[1]?.key, calls.send[0]?.key, "replay-capable retry reuses the key");
    assert.deepEqual(
      assistant.getSnapshot().messages.map((m) => m.id),
      ["q", "a"],
    );
  });

  it("falls back to a fresh key when the interrupted run failed server-side", async () => {
    let attempt = 0;
    const { assistant, calls } = fixture(async (_input, _signal, emit) => {
      attempt++;
      if (attempt === 1) {
        emit({ type: "started", runId: "run_1", userMessage: message("q", "user") });
        return "eof";
      }
      if (attempt === 2) throw new AssistantError("idempotency_conflict");
      emit({ type: "started", runId: "run_2", userMessage: message("q2", "user") });
      emit({ type: "answer", message: message("a", "assistant") });
      emit({ type: "completed" });
      return "terminal";
    });
    assistant.start();
    await tick();
    assistant.submit("hola");
    await tick();
    assistant.retry();
    await tick();
    await tick();
    assert.equal(calls.send.length, 3);
    assert.notEqual(calls.send[2]?.key, calls.send[0]?.key);
    assert.equal(assistant.getSnapshot().outcome, null);
  });

  it("reopens the session after session_expired and returns the question to the composer", async () => {
    const { assistant, calls } = fixture(async () => {
      throw new AssistantError("session_expired");
    });
    assistant.start();
    await tick();
    assistant.submit("hola");
    await tick();
    await tick();
    const state = assistant.getSnapshot();
    assert.equal(calls.open, 2);
    assert.equal(state.notice, "expired");
    assert.equal(state.restore?.text, "hola");
    assert.equal(state.refusal, null, "the expired notice replaces a generic error");
  });

  it("drops late events after dispose (unmount) and does not publish", async () => {
    const gate = deferred<void>();
    let emitLater: ((event: RunEvent) => void) | null = null;
    const { assistant } = fixture(async (_input, _signal, emit) => {
      emitLater = emit;
      emit({ type: "started", runId: "run_1", userMessage: null });
      await gate.promise;
      return "terminal";
    });
    assistant.start();
    await tick();
    assistant.submit("hola");
    await tick();
    let notified = 0;
    assistant.subscribe(() => notified++);
    assistant.dispose();
    (emitLater as ((event: RunEvent) => void) | null)?.({ type: "delta", text: "tarde" });
    gate.resolve();
    await tick();
    assert.equal(notified, 0);
  });

  it("clears the conversation by deleting the session and opening a new one", async () => {
    const { assistant, calls } = fixture(answering);
    assistant.start();
    await tick();
    assistant.submit("hola");
    await tick();
    await assistant.clear();
    assert.equal(calls.delete, 1);
    assert.equal(calls.open, 2);
    assert.equal(assistant.getSnapshot().messages.length, 0);
  });

  it("reports an unreachable API as a failed session with a reconnect path", async () => {
    let fail = true;
    const { assistant } = fixture(answering, {
      async openSession() {
        if (fail) throw new AssistantError("network", true);
        return snapshot([message("old", "user")]);
      },
    });
    assistant.start();
    await tick();
    assert.equal(assistant.getSnapshot().session, "failed");
    fail = false;
    assistant.reconnect();
    await tick();
    assert.equal(assistant.getSnapshot().session, "open");
    assert.equal(assistant.getSnapshot().messages.length, 1, "history is restored on reopen");
  });
});
