import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

describe("software license and reserved content", () => {
  it("preserves the entire reviewed canonical MIT grant and SPDX metadata", () => {
    // Official GitHub/OSI MIT text, 2026 first-commit year and existing holder.
    // Hash the whole file: a restrictive prefix or suffix must also fail.
    assert.equal(
      createHash("sha256").update(read("LICENSE")).digest("hex"),
      "75c55c220503c9c09b286ebc207e3faf73d628fe9302a8ded025d9eb8e55de92",
    );
    const pkg = JSON.parse(read("package.json")) as { license: string };
    const lock = JSON.parse(read("package-lock.json")) as {
      packages: Record<string, { license: string }>;
    };
    assert.equal(pkg.license, "MIT");
    assert.equal(lock.packages[""]?.license, "MIT");
  });

  it("keeps exclusions separate and ships all application notices", () => {
    const notice = read("NOTICE.md");
    for (const excluded of [
      "visual identity",
      "catalog datasets",
      "private data",
      "Third-party software",
    ]) {
      assert.ok(notice.includes(excluded));
    }
    assert.ok(read("README.md").includes("[NOTICE.md](NOTICE.md)"));
    assert.ok(read("THIRD_PARTY_NOTICES.md").includes("[MIT License](LICENSE)"));
    assert.ok(read("Dockerfile").includes('org.opencontainers.image.licenses="MIT"'));
    assert.ok(read("Dockerfile").includes("LICENSE NOTICE.md THIRD_PARTY_NOTICES.md ./"));
    assert.ok(read(".dockerignore").split("\n").includes("!NOTICE.md"));
  });
});
