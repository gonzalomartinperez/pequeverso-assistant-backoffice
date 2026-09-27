// Enforces the feature architecture (docs/architecture.md). Import specifiers are read with a
// tolerant scanner rather than the TypeScript compiler API, which TypeScript 7 does not expose.
//
//   domain        → domain only; no browser, network, timer or process globals
//   application   → domain, application
//   adapters      → domain, application, adapters
//   presentation  → domain, application (types), presentation, shared; never adapters
//   embed/protocol→ pure (domain types only; no window)
//   entry.tsx     → the only module that imports adapters
// Everywhere: no sibling-repository or absolute imports, no NEXT_PUBLIC_* configuration.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;
const IMPURE =
  /\b(window|document|fetch|localStorage|sessionStorage|AbortController|setTimeout|setInterval|process|globalThis|ReadableStream|TextDecoder)\b/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function layer(file: string): Layer {
  const rel = path.relative(src, file).split(path.sep).join("/");
  if (rel === "features/assistant/entry.tsx") return "entry";
  if (rel === "features/embed/protocol.ts") return "protocol";
  const match = rel.match(/^features\/assistant\/(domain|application|adapters|presentation)\//);
  const feature = FEATURE_LAYERS.find((name) => name === match?.[1]);
  if (feature) return feature;
  if (rel.startsWith("features/embed/")) return "embed";
  if (rel.startsWith("shared/")) return "shared";
  if (rel.startsWith("app/")) return "app";
  return "other";
}

function resolve(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return path.join(src, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(from), specifier);
  return null; // package import
}

type Layer =
  | "domain"
  | "application"
  | "adapters"
  | "presentation"
  | "protocol"
  | "embed"
  | "shared"
  | "entry"
  | "app"
  | "other";

const FEATURE_LAYERS = ["domain", "application", "adapters", "presentation"] as const;

const ALLOWED: Record<Layer, Layer[]> = {
  domain: ["domain"],
  application: ["domain", "application"],
  adapters: ["domain", "application", "adapters"],
  presentation: ["domain", "application", "presentation", "shared", "entry"],
  protocol: ["domain"],
  embed: ["domain", "application", "presentation", "protocol", "embed", "shared", "entry"],
  shared: ["domain", "shared", "protocol"],
  entry: ["domain", "application", "adapters"],
  app: ["domain", "presentation", "embed", "shared", "protocol", "entry", "app"],
  other: [
    "domain",
    "application",
    "adapters",
    "presentation",
    "protocol",
    "embed",
    "shared",
    "entry",
    "app",
    "other",
  ],
};

const problems: string[] = [];
const files = walk(src);
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const from = layer(file);
  const rel = path.relative(root, file);
  if (/NEXT_PUBLIC_/.test(text))
    problems.push(`${rel}: NEXT_PUBLIC_* configuration is not used by this app`);
  if (
    (from === "domain" || from === "protocol") &&
    IMPURE.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""))
  )
    problems.push(`${rel}: ${from} must stay pure (${text.match(IMPURE)?.[1]})`);
  for (const match of text.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;
    if (specifier.startsWith("/") || /\.\.\/\.\.\/\.\.\/\.\.\/\.\./.test(specifier))
      problems.push(`${rel}: suspicious import ${specifier}`);
    const target = resolve(file, specifier);
    if (!target) {
      if (
        (from === "domain" || from === "protocol" || from === "application") &&
        specifier !== "server-only"
      )
        problems.push(`${rel}: ${from} may not import package ${specifier}`);
      if (from === "presentation" && (specifier === "server-only" || specifier.startsWith("node:")))
        problems.push(`${rel}: presentation may not import ${specifier}`);
      continue;
    }
    if (!target.startsWith(src)) {
      problems.push(`${rel}: imports outside src (${specifier})`);
      continue;
    }
    const candidates = [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")];
    const resolved = candidates.find((candidate) => files.includes(candidate)) ?? target;
    const to = layer(resolved);
    if (!ALLOWED[from].includes(to))
      problems.push(`${rel}: ${from} may not import ${to} (${specifier})`);
  }
}
for (const problem of problems) console.error(problem);
console.log(`Boundaries: ${files.length} modules checked, ${problems.length} violations.`);
if (problems.length) process.exitCode = 1;
