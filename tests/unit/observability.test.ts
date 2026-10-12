import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { SafeObservability } from "../../src/server/observability.ts";
import { parseObservability } from "../../src/server/observability-config.ts";

const TOKEN = "synthetic-private-scrape-token-0000000000000000";

test("observability is off by default and scrape credentials are independent", () => {
  assert.deepEqual(parseObservability({}), { metricsToken: null, otlpEndpoint: null });
  const disabled = new SafeObservability(parseObservability({}));
  assert.equal(disabled.authorize(`Bearer ${TOKEN}`), "disabled");
  const enabled = new SafeObservability(
    parseObservability({ OBSERVABILITY_METRICS_ENABLED: "true", OBSERVABILITY_READ_TOKEN: TOKEN }),
  );
  for (const bad of [null, TOKEN, "Bearer wrong", `Bearer ${TOKEN} `])
    assert.equal(enabled.authorize(bad), "rejected");
  assert.equal(enabled.authorize(`Bearer ${TOKEN}`), "allowed");
  assert.throws(
    () =>
      parseObservability({
        OBSERVABILITY_METRICS_ENABLED: "true",
        OBSERVABILITY_READ_TOKEN: TOKEN,
        OPS_READ_TOKEN: TOKEN,
      }),
    /must differ/,
  );
});

test("malformed enabled settings fail without echoing URLs or tokens", () => {
  const cases = [
    { OBSERVABILITY_METRICS_ENABLED: "yes" },
    {
      OBSERVABILITY_TRACES_ENABLED: "true",
      OBSERVABILITY_OTLP_TRACES_ENDPOINT: "https://collector/v1/traces",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=SECRET",
    },
    {
      OBSERVABILITY_TRACES_ENABLED: "true",
      OBSERVABILITY_OTLP_TRACES_ENDPOINT: "http://localhost/v1/traces",
      BACKOFFICE_ENVIRONMENT: "production",
    },
    { OBSERVABILITY_METRICS_ENABLED: "true", OBSERVABILITY_READ_TOKEN: "SECRET" },
    {
      OBSERVABILITY_TRACES_ENABLED: "true",
      OBSERVABILITY_OTLP_TRACES_ENDPOINT: "https://user:SECRET@collector/v1/traces",
    },
    {
      OBSERVABILITY_TRACES_ENABLED: "true",
      OBSERVABILITY_OTLP_TRACES_ENDPOINT: "https://collector/v1/traces?SECRET",
    },
    {
      OBSERVABILITY_TRACES_ENABLED: "true",
      OBSERVABILITY_OTLP_TRACES_ENDPOINT: "http://public.example/v1/traces",
    },
  ];
  for (const env of cases) {
    try {
      parseObservability(env);
      assert.fail("expected refusal");
    } catch (error) {
      assert.doesNotMatch(String(error), /SECRET|public\.example/);
    }
  }
});

test("bounded labels and histogram counts exclude arbitrary errors, credentials and URLs", async () => {
  const source = new SafeObservability({ metricsToken: TOKEN, otlpEndpoint: null });
  await source.observe(
    "ops_summary",
    async () => ({ status: "ok" }),
    () => "ok",
  );
  await source.observe(
    "readiness",
    async () => false,
    () => "unavailable",
  );
  await assert.rejects(
    source.observe(
      "ops_telemetry",
      async () => {
        throw new Error("SECRET https://user:token@db/private?q=email");
      },
      () => "ok",
    ),
  );
  const metrics = source.metrics();
  assert.match(metrics, /operation="ops_summary",outcome="ok"\} 1/);
  assert.match(metrics, /operation="readiness",outcome="unavailable"\} 1/);
  assert.match(metrics, /operation="ops_telemetry",outcome="error"\} 1/);
  assert.match(metrics, /duration_seconds_bucket\{operation="ops_summary",le="\+Inf"\} 1/);
  assert.doesNotMatch(metrics, /SECRET|https:|email|token|q=/);
});

test("manual OTLP exports only fixed safe operation attributes, not Next's default spans", async () => {
  let payload = "";
  const server = createServer(async (request, response) => {
    for await (const chunk of request) payload += String(chunk);
    response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const source = new SafeObservability({
    metricsToken: null,
    otlpEndpoint: `http://127.0.0.1:${address.port}/v1/traces`,
  });
  try {
    await source.observe(
      "ops_summary",
      async (traceparent) => {
        assert.match(traceparent ?? "", /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/);
        return "SECRET http://private/invitacion/token?email";
      },
      () => "ok",
    );
    await source.shutdown();
    assert.ok(payload.length > 0);
    assert.match(source.metrics(), /trace_export_total\{outcome="ok"\} 1/);
    const wire = JSON.parse(payload);
    assert.equal(wire.resourceSpans[0].scopeSpans[0].spans[0].name, "ops_summary");
    assert.match(payload, /pequeverso-backoffice/);
    assert.doesNotMatch(payload, /SECRET|invitacion|http\.url|http\.target|email|authorization/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("collector failure stays outside the business result and exports only a safe batch failure count", async () => {
  const server = createServer((_request, response) =>
    response.writeHead(400).end("PRIVATE_COLLECTOR_ERROR"),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const source = new SafeObservability({
    metricsToken: null,
    otlpEndpoint: `http://127.0.0.1:${address.port}/v1/traces`,
  });
  try {
    const result = await source.observe(
      "ops_summary",
      async () => "business-result",
      () => "ok",
    );
    assert.equal(result, "business-result");
    await source.shutdown();
    assert.match(source.metrics(), /trace_export_total\{outcome="error"\} 1/);
    assert.match(source.metrics(), /operation="ops_summary",outcome="ok"\} 1/);
    assert.doesNotMatch(source.metrics(), /PRIVATE|127\.0\.0\.1/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
