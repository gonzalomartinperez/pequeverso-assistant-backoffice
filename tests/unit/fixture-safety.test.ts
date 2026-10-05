import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { assertDisposableDatabase } from "../../src/server/fixture-safety.ts";
import { parseConfig } from "../../src/server/parse-config.ts";

const PROBE = "fixture-redaction-probe";

describe("fixture safety", () => {
  it("database-creating tests refuse remote or malformed URLs before connecting, without echoing them", () => {
    for (const url of [
      `postgres://u:${PROBE}@shared.invalid/backoffice_test`,
      `invalid-${PROBE}`,
    ]) {
      const env: NodeJS.ProcessEnv = { ...process.env, TEST_DATABASE_URL: url };
      delete env.DATABASE_URL;
      delete env.NODE_TEST_CONTEXT; // a nested runner marker would skip the probe
      const result = spawnSync(process.execPath, ["--test", "tests/integration/auth.test.ts"], {
        env,
        encoding: "utf8",
        timeout: 15_000,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /loopback|disposable/);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(PROBE));
    }
  });

  it("the browser stack refuses a remote database", () => {
    const result = spawnSync(process.execPath, ["scripts/backoffice-stack.ts"], {
      env: { ...process.env, TEST_DATABASE_URL: `postgres://u:${PROBE}@db.example.com/x_test` },
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(PROBE));
  });

  it("requires a test/fixture database name where asked", () => {
    assert.throws(
      () => assertDisposableDatabase("postgres://u:p@127.0.0.1/backoffice", true),
      /test\/fixture/,
    );
    assert.equal(
      assertDisposableDatabase("postgres://u:p@127.0.0.1/bo_test_x", true),
      "postgres://u:p@127.0.0.1/bo_test_x",
    );
  });

  it("test-only auth switches need loopback origin, issuer and a disposable database", () => {
    const base = {
      BACKOFFICE_ENVIRONMENT: "test",
      BACKOFFICE_ORIGIN: "http://localhost:3241",
      DATABASE_URL: "postgres://u:p@127.0.0.1:5432/bo_test_e2e",
      AUTH_TEST_ISSUER: "http://127.0.0.1:8238",
    };
    assert.equal(parseConfig(base).testIssuer, "http://127.0.0.1:8238");
    assert.throws(() =>
      parseConfig({ ...base, DATABASE_URL: "postgres://u:p@db.internal/bo_test" }),
    );
    assert.throws(() =>
      parseConfig({ ...base, DATABASE_URL: "postgres://u:p@127.0.0.1/backoffice" }),
    );
    assert.throws(() => parseConfig({ ...base, AUTH_TEST_ISSUER: "https://idp.example.com" }));
    assert.throws(() =>
      parseConfig({ ...base, BACKOFFICE_ORIGIN: "https://backoffice.example.com" }),
    );
    assert.throws(() =>
      parseConfig({
        ...base,
        AUTH_TEST_ISSUER: undefined,
        AUTH_DISABLE_RATE_LIMIT: "1",
        DATABASE_URL: "postgres://u:p@db/x",
      }),
    );
  });
});
