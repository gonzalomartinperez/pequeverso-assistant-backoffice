import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { it } from "node:test";
import { checkBoundaries } from "../../scripts/check-boundaries.ts";

it("keeps the feature architecture boundaries", () => {
  const output = execFileSync(process.execPath, ["scripts/check-boundaries.ts"], {
    encoding: "utf8",
  });
  assert.match(output, /0 violations/);
});

// Virtual modules exercise the checker without importing/executing fixture code or touching src/.
const fixtureRoot = path.resolve("/virtual-backoffice");
function inspect(files: Record<string, string>): string[] {
  return checkBoundaries(
    new Map(
      Object.entries(files).map(([file, text]) => [path.join(fixtureRoot, "src", file), text]),
    ),
    fixtureRoot,
  );
}

it("rejects IO globals in application and domain, including after a quoted URL", () => {
  for (const layer of ["domain", "application"]) {
    for (const expression of ["fetch(url)", "process.env", "setTimeout(() => {}, 1)"]) {
      const problems = inspect({
        [`features/auth/${layer}/probe.ts`]: `const url = "https://example.invalid"; export const probe = () => ${expression};`,
      });
      assert.match(problems.join("\n"), new RegExp(`${layer} must stay pure`));
    }
  }
});

it("rejects runtime application dependencies from presentation through aliases and relative paths", () => {
  for (const statement of [
    'import { inviteMember } from "../application/access";',
    'export { inviteMember } from "@/features/auth/application/access";',
    'export const load = () => import("../application/access");',
    'export const load = () => import("../application/access", {});',
    "export const load = () => import (`../application/access`);",
    'import "../application/access";',
  ]) {
    assert.match(
      inspect({ "features/auth/presentation/probe.ts": statement }).join("\n"),
      /presentation may only import application types/,
    );
  }
});

it("allows explicit type-only imports and re-exports from the same application's ports", () => {
  assert.deepEqual(
    inspect({
      "features/auth/presentation/probe.ts":
        'import type { Actor } from "../application/ports";\nexport type { Actor } from "../application/ports";',
    }),
    [],
  );
});

it("rejects mixed type/value imports and unknown feature placement, even without imports", () => {
  assert.match(
    inspect({
      "features/auth/presentation/probe.ts":
        'import { type Actor, inviteMember } from "../application/access";',
    }).join("\n"),
    /presentation may only import application types/,
  );
  for (const file of ["features/auth/probe.ts", "features/auth/infrastructure/probe.ts"]) {
    assert.match(
      inspect({ [file]: 'import { Pool } from "pg";' }).join("\n"),
      /feature modules must belong to a recognized layer/,
    );
    assert.match(
      inspect({ [file]: "export const probe = 1;" }).join("\n"),
      /feature modules must belong to a recognized layer/,
    );
  }
});

it("preserves legitimate outer composition and pure injected application dependencies", () => {
  assert.deepEqual(
    inspect({
      "proxy.ts": 'import { NextResponse } from "next/server";',
      "instrumentation.ts": 'export const register = () => import("./server/observability");',
      "server/auth.ts":
        'import { inviteMember } from "@/features/auth/application/access";\nimport { Pool } from "pg";',
      "features/auth/adapters/store.ts": 'import { Pool } from "pg";',
      "features/auth/application/access.ts":
        'import type { Clock } from "./ports";\nexport const now = (clock: Clock) => clock.now();',
      "features/auth/application/ports.ts": "export interface Clock { now(): Date; }",
    }),
    [],
  );
});

it("keeps existing cross-feature, package, outside-src and adapter restrictions", () => {
  const cases = [
    [
      "features/auth/domain/probe.ts",
      'import { readFileSync } from "node:fs";',
      /may not import package/,
    ],
    ["features/auth/application/probe.ts", 'import { Pool } from "pg";', /may not import package/],
    [
      "features/auth/presentation/probe.ts",
      'import { store } from "../adapters/store";',
      /may not import adapters/,
    ],
    [
      "features/auth/presentation/probe.ts",
      'import type { Port } from "@/features/operations/application/ports";',
      /may not import feature operations/,
    ],
    ["server/probe.ts", 'import { external } from "@/../../external";', /imports outside src/],
  ] as const;
  for (const [file, source, expected] of cases) {
    assert.match(inspect({ [file]: source }).join("\n"), expected);
  }
});

it("ignores commented-out imports and impurity examples", () => {
  assert.deepEqual(
    inspect({
      "features/auth/application/probe.ts":
        '// fetch("https://example.invalid");\n/* import { Pool } from "pg"; */\nexport const probe = 1;',
    }),
    [],
  );
});

it("rejects static template and import-options adapter dependencies from presentation", () => {
  for (const statement of [
    "export const load = () => import(`../adapters/store`);",
    "export const load = () => import (`@/features/auth/adapters/store`, {});",
    'export const load = () => import("../adapters/store", { with: { type: "json" } });',
  ]) {
    assert.match(
      inspect({ "features/auth/presentation/probe.ts": statement }).join("\n"),
      /presentation may not import adapters/,
    );
  }
});
