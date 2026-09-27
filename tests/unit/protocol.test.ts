import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CHANNEL,
  envelope,
  parseAllowedOrigins,
  parseAssistantMessage,
  parseHostMessage,
  VERSION,
} from "../../src/features/embed/protocol.ts";

const examples = JSON.parse(
  readFileSync(new URL("../../contracts/embed.v1.examples.json", import.meta.url), "utf8"),
) as {
  valid: { host: unknown[]; assistant: unknown[] };
  invalid: { host: unknown[]; assistant: unknown[] };
};

describe("embed protocol v1", () => {
  it("accepts every documented valid example", () => {
    for (const message of examples.valid.host)
      assert.ok(parseHostMessage(message), JSON.stringify(message));
    for (const message of examples.valid.assistant)
      assert.ok(parseAssistantMessage(message), JSON.stringify(message));
  });

  it("rejects every documented invalid example (version, channel, extra keys, types, unknown types)", () => {
    for (const message of examples.invalid.host)
      assert.equal(parseHostMessage(message), null, JSON.stringify(message));
    for (const message of examples.invalid.assistant)
      assert.equal(parseAssistantMessage(message), null, JSON.stringify(message));
  });

  it("round-trips through the envelope helper", () => {
    const message = envelope({ type: "assistant.request", action: "minimize" } as const);
    assert.deepEqual(message, {
      channel: CHANNEL,
      version: VERSION,
      type: "assistant.request",
      action: "minimize",
    });
    assert.deepEqual(parseAssistantMessage(message), {
      type: "assistant.request",
      action: "minimize",
    });
  });

  it("has no message type that can carry text, URLs or credentials", () => {
    const schema = readFileSync(
      new URL("../../contracts/embed.v1.schema.json", import.meta.url),
      "utf8",
    );
    for (const forbidden of ["url", "token", "csrf", "content", "transcript", 'message"'])
      assert.ok(!schema.toLowerCase().includes(`"${forbidden}`), forbidden);
  });
});

describe("EMBED_ALLOWED_ORIGINS", () => {
  it("parses exact origins and deduplicates", () => {
    assert.deepEqual(
      parseAllowedOrigins("https://pequeverso.com, https://pequeverso.com,http://localhost:3210"),
      ["https://pequeverso.com", "http://localhost:3210"],
    );
    assert.deepEqual(parseAllowedOrigins(undefined), []);
    assert.deepEqual(parseAllowedOrigins(" "), []);
  });

  it("rejects wildcards, paths, credentials, plain http outside localhost and long lists", () => {
    for (const bad of [
      "*",
      "https://*.pequeverso.com",
      "https://pequeverso.com/",
      "https://pequeverso.com/embed",
      "https://user@pequeverso.com",
      "http://pequeverso.com",
      "pequeverso.com",
      Array.from({ length: 9 }, (_, i) => `https://s${i}.example`).join(","),
    ])
      assert.throws(() => parseAllowedOrigins(bad), bad);
  });
});
