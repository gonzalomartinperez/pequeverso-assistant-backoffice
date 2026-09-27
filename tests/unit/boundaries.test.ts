import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("keeps the feature architecture boundaries", () => {
  const output = execFileSync(process.execPath, ["scripts/check-boundaries.ts"], {
    encoding: "utf8",
  });
  assert.match(output, /0 violations/);
});
