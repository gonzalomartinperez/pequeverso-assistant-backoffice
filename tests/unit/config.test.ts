import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConfig } from "../../src/server/parse-config.ts";

const production = {
  BACKOFFICE_ENVIRONMENT: "production",
  BACKOFFICE_ORIGIN: "https://backoffice.example.test",
  BETTER_AUTH_SECRET: "s".repeat(40),
  DATABASE_URL: "postgres://user:pass@db:5432/backoffice",
  OWNER_EMAIL: "Owner@Example.test",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};

describe("backoffice configuration", () => {
  it("accepts a complete production configuration", () => {
    const config = parseConfig(production);
    assert.equal(config.ownerEmail, "owner@example.test");
    assert.equal(config.github?.clientId, "id");
    assert.equal(config.google, null);
    assert.equal(config.ops, null);
    assert.equal(config.rateLimit, true);
  });

  it("fails closed in production", () => {
    const cases: Record<string, string | undefined>[] = [
      { ...production, BACKOFFICE_ORIGIN: "http://backoffice.example.test" },
      { ...production, BACKOFFICE_ORIGIN: "https://backoffice.example.test/path" },
      { ...production, BETTER_AUTH_SECRET: "short" },
      { ...production, DATABASE_URL: "" },
      { ...production, OWNER_EMAIL: "" },
      { ...production, GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" },
      { ...production, GITHUB_CLIENT_SECRET: "" },
      { ...production, AUTH_TEST_ISSUER: "http://127.0.0.1:8218" },
      { ...production, OPS_API_URL: "http://api:8000" },
      { ...production, OPS_API_URL: "http://api:8000", OPS_READ_TOKEN: "short" },
      { ...production, OPS_API_URL: "http://u:p@api:8000", OPS_READ_TOKEN: "t".repeat(40) },
      { ...production, BACKOFFICE_ENVIRONMENT: "staging" },
      { ...production, AUTH_DISABLE_RATE_LIMIT: "1" },
    ];
    for (const env of cases) assert.throws(() => parseConfig(env));
  });

  it("allows local http origins and the test identity provider outside production", () => {
    const config = parseConfig({
      BACKOFFICE_ENVIRONMENT: "test",
      BACKOFFICE_ORIGIN: "http://127.0.0.1:3221",
      AUTH_TEST_ISSUER: "http://127.0.0.1:8218",
      DATABASE_URL: "postgres://u:p@127.0.0.1:5432/bo_test_unit",
      OPS_API_URL: "http://127.0.0.1:8217/",
      OPS_READ_TOKEN: "t".repeat(40),
    });
    assert.equal(config.testIssuer, "http://127.0.0.1:8218");
    assert.equal(config.ops?.url, "http://127.0.0.1:8217");
  });
});
