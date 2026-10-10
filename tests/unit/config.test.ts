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

  it("treats NODE_ENV=production as production unless explicitly a loopback test", () => {
    const { BACKOFFICE_ENVIRONMENT: _, ...implicit } = production;
    assert.equal(parseConfig({ ...implicit, NODE_ENV: "production" }).environment, "production");
    assert.throws(
      () => parseConfig({ NODE_ENV: "production" }),
      /BACKOFFICE_ORIGIN|BETTER_AUTH_SECRET|OWNER_EMAIL|DATABASE_URL/,
    );
    assert.throws(
      () =>
        parseConfig({ ...implicit, NODE_ENV: "production", BACKOFFICE_ENVIRONMENT: "development" }),
      /refused/,
    );
    assert.throws(() =>
      parseConfig({
        NODE_ENV: "production",
        BACKOFFICE_ENVIRONMENT: "test",
        BACKOFFICE_ORIGIN: "https://bo.example.test",
      }),
    );
    assert.equal(
      parseConfig({ NODE_ENV: "production", BACKOFFICE_ENVIRONMENT: "test" }).environment,
      "test",
    );
  });

  it("never uses a fixed secret outside test", () => {
    assert.throws(
      () => parseConfig({ BACKOFFICE_ENVIRONMENT: "development" }),
      /BETTER_AUTH_SECRET/,
    );
    assert.throws(() => parseConfig({}), /BETTER_AUTH_SECRET/);
    const test = parseConfig({ BACKOFFICE_ENVIRONMENT: "test" });
    assert.match(test.authSecret, /test-only/);
  });

  it("allows http for the ops API only to a private-network service name or an allowlisted host", () => {
    const token = "t".repeat(40);
    const ok = (url: string, extra: Record<string, string> = {}) =>
      parseConfig({ ...production, OPS_API_URL: url, OPS_READ_TOKEN: token, ...extra }).ops?.url;
    assert.equal(
      ok("http://pequeverso-assistant-api:8000"),
      "http://pequeverso-assistant-api:8000",
    );
    assert.equal(ok("https://ops.example.test"), "https://ops.example.test");
    assert.throws(() => ok("http://ops.example.test"));
    assert.throws(() => ok("http://203.0.113.5:8000"));
    assert.throws(() => ok("http://localhost:8000"));
    assert.equal(
      ok("http://api.internal:8000", { OPS_API_INSECURE_INTERNAL_HOSTS: "api.internal" }),
      "http://api.internal:8000",
    );
  });

  it("accepts valid proxy IPs and CIDRs at the existing width boundaries", () => {
    const valid = [
      "10.0.1.5",
      "::1",
      "2001:db8::1",
      "::ffff:192.0.2.1",
      "10.0.0.0/8",
      "10.0.1.5/32",
      "2001:db8::/16",
      "2001:db8::1/128",
    ];
    assert.deepEqual(
      parseConfig({ ...production, TRUSTED_PROXY_IPS: ` ${valid.join(", ")}, ` }).trustedProxies,
      valid,
    );
    assert.deepEqual(parseConfig(production).trustedProxies, []);
  });

  it("rejects malformed proxy IP literals before production can start", () => {
    for (const bad of [
      "proxy.local",
      "::::",
      "::::/32",
      "2001:::1",
      "1:2:3:4:5:6:7:8:9",
      "999.0.0.1",
      "01.2.3.4",
      "10.0.1.5/24/24",
    ])
      assert.throws(
        () => parseConfig({ ...production, TRUSTED_PROXY_IPS: bad }),
        /TRUSTED_PROXY_IPS/,
      );
  });

  it("rejects unsupported proxy CIDR widths and nondecimal notation", () => {
    for (const bad of [
      "0.0.0.0/0",
      "10.0.0.0/7",
      "10.0.0.1/33",
      "::1/0",
      "::1/15",
      "::1/129",
      "::1/1e2",
      "10.0.0.1/3.2",
      "10.0.0.1/+24",
      "10.0.0.1/",
      "::1/-1",
      "::1/ 32",
    ])
      assert.throws(
        () => parseConfig({ ...production, TRUSTED_PROXY_IPS: bad }),
        /TRUSTED_PROXY_IPS/,
      );
  });

  it("error messages never echo configured values", () => {
    try {
      parseConfig({
        ...production,
        OPS_API_URL: "http://u:SECRETVALUE@x.example/",
        OPS_READ_TOKEN: "t".repeat(40),
      });
      assert.fail("expected a refusal");
    } catch (error) {
      assert.doesNotMatch(String(error), /SECRETVALUE/);
    }
  });
});
