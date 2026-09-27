// High-confidence secret scan of tracked and untracked (non-ignored) files. Not a complete audit.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean),
  ),
];
const rules: [string, RegExp][] = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["provider-token", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["cloud-access-key", /\bAKIA[A-Z0-9]{16}\b/],
  ["public-secret-config", /NEXT_PUBLIC_[A-Z_]*(?:SECRET|PASSWORD|PRIVATE_KEY|API_KEY)/],
];
let findings = 0;
let checked = 0;
for (const file of files) {
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".example")) {
    console.error(`environment-file: ${file} (contents redacted)`);
    findings++;
    continue;
  }
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  checked++;
  const text = bytes.toString("utf8");
  for (const [name, pattern] of rules)
    if (pattern.test(text)) {
      console.error(`${name}: ${file} (matched value redacted)`);
      findings++;
    }
}
console.log(
  `Public-file scan: ${checked} text files, ${findings} findings. High-confidence patterns only; not a complete secret audit.`,
);
if (findings) process.exitCode = 1;
