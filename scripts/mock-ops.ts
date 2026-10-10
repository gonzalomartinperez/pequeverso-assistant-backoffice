// Deterministic stand-in for the API's private ops endpoint (tests and local previews only).
// Serves contracts/ops/summary.fixture.json — explicitly SYNTHETIC data — behind the same bearer
// check as the API. Variants for tests: GET /__variant?name=single|missing|invalid|down.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.env.MOCK_OPS_PORT ?? 8237);
const token = process.env.OPS_READ_TOKEN ?? "test-ops-read-token-0000000000000000";
const fixture = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "..", "contracts/ops/summary.fixture.json"),
    "utf8",
  ),
) as Record<string, unknown>;
let variant = "full";

function payload(): unknown {
  if (variant === "invalid") return { schema_version: "9" };
  if (variant === "single") {
    const daily = fixture.daily as unknown[];
    return {
      ...fixture,
      daily: daily.slice(-1),
      windows: (fixture.windows as unknown[]).slice(0, 1),
    };
  }
  if (variant === "missing")
    return {
      schema_version: "1",
      generated_at: fixture.generated_at,
      service: { provider: "fixture", synthetic: true },
      availability: { status: "unavailable", reason: "catalog_unavailable" },
      catalog: {
        status: "missing",
        last_failure: "HTTPStatusError",
        last_attempt_at: fixture.generated_at,
      },
      budget: null,
      windows: [],
      daily: [],
      metrics_since: null,
    };
  return fixture;
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://mock");
  if (url.pathname === "/__variant") {
    variant = url.searchParams.get("name") ?? "full";
    response.writeHead(204).end();
    return;
  }
  if (url.pathname !== "/internal/v1/ops/summary" || request.method !== "GET") {
    response.writeHead(404).end();
    return;
  }
  if (variant === "down") {
    response.writeHead(503, { "content-type": "application/json" }).end("{}");
    return;
  }
  if (request.headers.authorization !== `Bearer ${token}`) {
    response
      .writeHead(401, { "content-type": "application/json" })
      .end('{"error":{"code":"unauthorized"}}');
    return;
  }
  response
    .writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    .end(JSON.stringify(payload()));
}).listen(port, "127.0.0.1", () => console.log(`mock ops (SYNTHETIC) on http://127.0.0.1:${port}`));
