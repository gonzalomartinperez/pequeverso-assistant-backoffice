import assert from "node:assert/strict";
import { it } from "node:test";
import { backofficeCsp } from "../../src/server/csp.ts";

it("backoffice CSP is nonce-based, unframable and has no unsafe script sources in production", () => {
  const csp = backofficeCsp("abc123", false);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(
    csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "",
    /unsafe-inline/,
  );
  assert.match(backofficeCsp("abc123", true), /'unsafe-eval'/);
});
