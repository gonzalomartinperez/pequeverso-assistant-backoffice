import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readHttpTelemetry } from "../../src/features/operations/adapters/telemetry-http.ts";
import { parseOpsTelemetry } from "../../src/features/operations/adapters/telemetry-validate.ts";

const fixture = JSON.parse(readFileSync("contracts/telemetry/ops.telemetry.example.json", "utf8"));
const settings = { url: "https://private", token: "fixture-only" };

test("telemetry pinned bytes come from the committed API source", () => {
  const source = JSON.parse(readFileSync("contracts/telemetry/source.json", "utf8"));
  assert.equal(source.api_revision, "b7dcb0c27d214cb1b560a8ee6101f858545646fc");
  for (const file of Object.values(source.files) as { local: string; sha256: string }[])
    assert.equal(createHash("sha256").update(readFileSync(file.local)).digest("hex"), file.sha256);
  const reading = parseOpsTelemetry(fixture);
  assert.equal(reading.readiness.ready, true);
  assert.equal(reading.synthetic, true);
  assert.equal(reading.resources.processRssBytes, null);
  assert.equal(reading.http.requests, 0);
});

test("telemetry rejects unsafe or misleading versions, values and observation semantics", () => {
  for (const bad of [
    { ...fixture, schema_version: "99" },
    { ...fixture, synthetic: "true" },
    { ...fixture, process_uptime_seconds: -1 },
    { ...fixture, active_runs: 0.5 },
    { ...fixture, max_concurrent_runs: 0 },
    { ...fixture, generated_at: "2026-02-30T00:00:00Z" },
    { ...fixture, readiness: { ...fixture.readiness, measurement: "uptime_percentage" } },
    { ...fixture, provider_observation: { status: "available", reason: "guessed" } },
    { ...fixture, resources: { ...fixture.resources, process_rss_bytes: "SECRET" } },
    { ...fixture, http: { ...fixture.http, window: "24hours" } },
    { ...fixture, traces: { ...fixture.traces, durable: true } },
    { ...fixture, traces: { ...fixture.traces, sampling_ratio: 1.1 } },
  ])
    assert.throws(() => parseOpsTelemetry(bad), /^Error: invalid private telemetry$/);
});

test("unknown resource values remain null; unknown payload fields never reach presentation", () => {
  const telemetry = parseOpsTelemetry({
    ...fixture,
    prompt: "PRIVATE",
    resources: { ...fixture.resources, auth: "SECRET" },
  });
  assert.equal(telemetry.resources.cgroupMemoryLimitBytes, null);
  assert.doesNotMatch(JSON.stringify(telemetry), /PRIVATE|SECRET/);
  assert.throws(() => parseOpsTelemetry({ ...fixture, resources: {} }));
});

test("optional telemetry does not request anything while disabled or unconfigured", async () => {
  const fail: typeof fetch = async () => {
    assert.fail("must not fetch");
  };
  assert.equal((await readHttpTelemetry(settings, false, fail)).status, "unavailable");
  assert.equal((await readHttpTelemetry(null, true, fail)).status, "unavailable");
});

test("API404, errors and invalid telemetry remain independent unavailable readings", async () => {
  for (const response of [
    new Response(null, { status: 404 }),
    new Response(null, { status: 401 }),
    Response.json({ schema_version: "wrong" }),
    new Response("x".repeat(65 * 1024)),
  ]) {
    const read = await readHttpTelemetry(settings, true, async () => response);
    assert.equal(read.status, "unavailable");
    assert.doesNotMatch(JSON.stringify(read), /fixture-only|https:\/\/private/);
  }
});

test("private telemetry is no-store, redirect-free, bounded and authenticated", async () => {
  const traceparent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01";
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://private/internal/v1/ops/telemetry");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer fixture-only");
    assert.equal(headers.get("traceparent"), traceparent);
    assert.equal(headers.get("baggage"), null);
    return Response.json(fixture);
  };
  const reading = await readHttpTelemetry(settings, true, fetcher, traceparent);
  assert.equal(reading.status, "ok");
});
