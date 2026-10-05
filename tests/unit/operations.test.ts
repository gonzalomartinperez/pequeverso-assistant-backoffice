import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { httpOpsSource, readBounded } from "../../src/features/operations/adapters/ops-http.ts";
import {
  OpsPayloadError,
  parseOpsSummary,
} from "../../src/features/operations/adapters/validate.ts";
import {
  acceptedRuns,
  addMoney,
  budgetUse,
  catalogFreshness,
  hasTrend,
  percent,
} from "../../src/features/operations/domain/summary.ts";

const pinned = JSON.parse(readFileSync("contracts/ops/ops.summary.example.json", "utf8"));
const fixture = JSON.parse(readFileSync("contracts/ops/summary.fixture.json", "utf8"));

describe("ops summary contract", () => {
  it("parses the example pinned from the committed API revision", () => {
    const summary = parseOpsSummary(pinned);
    assert.equal(summary.service.synthetic, true);
    assert.equal(summary.catalog.status, "active");
    assert.equal(summary.windows[0]?.runs.refused, 1);
    assert.equal(summary.budget?.monthSpend.estimated, "0.005400");
    assert.ok(summary.catalog.activatedAt instanceof Date);
    assert.equal(summary.pricing?.model, "gpt-6-luna");
    assert.equal(summary.recent[1]?.outcome, "refused");
    assert.equal(summary.recent[1]?.modelCall, false);
  });

  it("rejects recent runs with non-opaque ids or unknown outcomes", () => {
    const run = pinned.recent[0];
    for (const bad of [
      { ...run, id: "run_abc" },
      { ...run, outcome: "ok" },
      { ...run, language: "fr" },
    ])
      assert.throws(() => parseOpsSummary({ ...pinned, recent: [bad] }), OpsPayloadError);
    assert.throws(
      () => parseOpsSummary({ ...pinned, recent: Array.from({ length: 51 }, () => run) }),
      OpsPayloadError,
    );
  });

  it("parses the local synthetic fixture with the same shape", () => {
    assert.equal(parseOpsSummary(fixture).daily.length, 7);
  });

  it("keeps the pinned files identical to the recorded hashes", async () => {
    const { createHash } = await import("node:crypto");
    const source = JSON.parse(readFileSync("contracts/ops/source.json", "utf8"));
    for (const entry of Object.values(source.files) as { local: string; sha256: string }[])
      assert.equal(
        createHash("sha256").update(readFileSync(entry.local)).digest("hex"),
        entry.sha256,
      );
  });

  it("maps missing values to null, never to zero", () => {
    const summary = parseOpsSummary({
      schema_version: "1",
      generated_at: "2026-10-05T00:00:00Z",
      service: { provider: "openai", synthetic: false },
      availability: { status: "unavailable", reason: "budget_exhausted" },
      catalog: { status: "missing" },
      windows: [{ hours: 24, runs: { completed: 3 } }],
    });
    assert.equal(summary.budget, null);
    assert.equal(summary.windows[0]?.runs.failed, null);
    assert.equal(acceptedRuns(summary.windows[0]?.runs ?? ({} as never)), null);
    assert.equal(summary.catalog.revision, null);
    assert.equal(summary.service.synthetic, false);
    assert.deepEqual(summary.daily, []);
  });

  it("treats the fixture provider as synthetic even if the flag says otherwise", () => {
    const summary = parseOpsSummary({
      ...pinned,
      service: { ...pinned.service, synthetic: false },
    });
    assert.equal(summary.service.synthetic, true);
  });

  it("rejects wrong versions, types, oversized text and malformed money", () => {
    const bad = [
      { ...pinned, schema_version: "2" },
      { ...pinned, availability: { status: "maybe" } },
      { ...pinned, service: { ...pinned.service, model: "x".repeat(500) } },
      { ...pinned, budget: { ...pinned.budget, monthly_limit: "1e9" } },
      { ...pinned, windows: [{ ...pinned.windows[0], runs: { completed: -1 } }] },
      { ...pinned, daily: Array.from({ length: 61 }, () => pinned.daily[0]) },
      { ...pinned, windows: [{ ...pinned.windows[0], failures: { "<script>": 1 } }] },
      [],
      null,
    ];
    for (const payload of bad) assert.throws(() => parseOpsSummary(payload), OpsPayloadError);
  });
});

describe("summary derivations", () => {
  it("adds decimal money exactly and propagates unavailability", () => {
    assert.equal(addMoney("0.1", "0.2", "0.000001"), "0.300001");
    assert.equal(addMoney("1.5", null), null);
  });

  it("computes budget use from confirmed + estimated + pending", () => {
    assert.ok(Math.abs((budgetUse(parseOpsSummary(fixture)) ?? 0) - 4.357) < 1e-9);
  });

  it("needs two days for a trend and a positive whole for a percentage", () => {
    assert.equal(hasTrend([]), false);
    assert.equal(percent(1, 0), null);
    assert.equal(percent(1, 3), 33.3);
  });

  it("uses the API's price verdict for catalog freshness", () => {
    const summary = parseOpsSummary(pinned);
    assert.equal(catalogFreshness(summary, new Date()), "fresh");
    const stale = parseOpsSummary({
      ...pinned,
      catalog: { ...pinned.catalog, price_status: "unverified" },
    });
    assert.equal(catalogFreshness(stale, new Date()), "stale");
  });
});

describe("ops HTTP source", () => {
  const settings = { url: "http://ops.internal:8000", token: "t".repeat(40) };

  it("is unavailable when not configured, without any request", async () => {
    let called = false;
    const source = httpOpsSource(null, (async () => {
      called = true;
      return new Response();
    }) as typeof fetch);
    assert.equal((await source.read()).status, "unavailable");
    assert.equal(called, false);
  });

  it("sends the bearer token, never caches and refuses redirects", async () => {
    let seen: RequestInit | undefined;
    let url = "";
    const source = httpOpsSource(settings, (async (input: string, init?: RequestInit) => {
      url = input;
      seen = init;
      return Response.json(pinned);
    }) as typeof fetch);
    const reading = await source.read();
    assert.equal(reading.status, "ok");
    assert.equal(url, "http://ops.internal:8000/internal/v1/ops/summary");
    const headers = seen?.headers as Record<string, string> | undefined;
    assert.equal(headers?.Authorization, `Bearer ${settings.token}`);
    assert.equal(seen?.cache, "no-store");
    assert.equal(seen?.redirect, "error");
  });

  it("collapses failures into unavailable readings without details", async () => {
    const cases: [typeof fetch, string][] = [
      [
        (async () => {
          throw new TypeError("fetch failed");
        }) as typeof fetch,
        "unreachable",
      ],
      [(async () => new Response("{}", { status: 401 })) as typeof fetch, "rejected"],
      [(async () => new Response("{}", { status: 404 })) as typeof fetch, "rejected"],
      [(async () => new Response("not json")) as typeof fetch, "invalid"],
      [(async () => new Response("x".repeat(300_000))) as typeof fetch, "invalid"],
    ];
    for (const [fetcher, reason] of cases) {
      const reading = await httpOpsSource(settings, fetcher).read();
      assert.deepEqual(reading.status === "unavailable" ? reading.reason : "ok", reason);
    }
  });

  it("times out a hanging API", async () => {
    const hanging = ((_: string, init?: RequestInit) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      )) as typeof fetch;
    const reading = await httpOpsSource(settings, hanging, 50).read();
    assert.equal(reading.status === "unavailable" && reading.reason, "unreachable");
  });

  it("aborts a chunked body over the byte limit without trusting Content-Length", async () => {
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(64 * 1024).fill(0x61));
        if (pulled > 100) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(stream, { headers: { "content-length": "10" } });
    await assert.rejects(readBounded(response, 256 * 1024));
    assert.equal(cancelled, true);
    assert.ok(pulled <= 6, `read ${pulled} chunks before aborting`);
  });

  it("counts bytes, not UTF-16 characters", async () => {
    const text = "ñ".repeat(150_000); // 150 000 chars, 300 000 bytes
    await assert.rejects(readBounded(new Response(text), 256 * 1024));
    assert.equal(await readBounded(new Response("ñ".repeat(10)), 256 * 1024), "ñ".repeat(10));
  });

  it("collapses an oversized streamed ops response into an unavailable reading", async () => {
    const big = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(128 * 1024).fill(0x20));
      },
    });
    const reading = await httpOpsSource(
      { url: "http://ops.internal:8000", token: "t".repeat(40) },
      (async () => new Response(big)) as typeof fetch,
    ).read();
    assert.equal(reading.status === "unavailable" && reading.reason, "invalid");
  });
});
