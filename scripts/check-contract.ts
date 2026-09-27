// Verifies the pinned API contract snapshot is internally consistent: every artifact listed in the
// API's own manifest exists in contracts/api/ with the recorded SHA-256, and source.json names the
// manifest it came from. It cannot prove the snapshot matches a committed API revision (there is
// none yet); docs/api-contract.md records that status.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

type Manifest = { contract_version: string; artifacts: Record<string, string> };
type Source = { api_manifest_sha256: string; contract_version: string; status: string };

const root = new URL("../contracts/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const manifestBytes = read("api/manifest.json");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
const source = JSON.parse(read("source.json").toString("utf8")) as Source;
let failures = 0;
function fail(message: string) {
  console.error(message);
  failures++;
}
if (sha(manifestBytes) !== source.api_manifest_sha256)
  fail("contracts/api/manifest.json differs from the manifest recorded in contracts/source.json");
if (manifest.contract_version !== source.contract_version)
  fail("contract_version mismatch between manifest and source.json");
for (const [path, digest] of Object.entries(manifest.artifacts))
  if (sha(read(`api/${path}`)) !== digest)
    fail(`contracts/api/${path} differs from the pinned API manifest`);
console.log(
  `Contract: ${Object.keys(manifest.artifacts).length} pinned artifacts checked (${source.status}), ${failures} failures.`,
);
if (failures) process.exitCode = 1;
