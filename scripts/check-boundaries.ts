// Enforces the feature architecture (docs/architecture.md). Import specifiers are read with a
// tolerant scanner rather than the TypeScript compiler API, which TypeScript 7 does not expose.
//
// Features live in src/features/<feature>/<layer>/ (assistant, auth, operations):
//   domain        → own domain only; no browser, network, timer or process globals; no packages
//   application   → own domain and application; no IO globals or packages
//   adapters      → own domain, application, adapters; packages allowed
//   presentation  → own domain, application (types), presentation, shared; never adapters or server
// A feature's inner layers never import another feature (presentation may reuse shared UI only).
// Other areas:
//   src/server    → server-only composition: features (any layer), shared, server
//   src/app       → routes: feature domain/application/presentation, server, shared
// Everywhere: no sibling-repository or absolute imports, no NEXT_PUBLIC_* configuration.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;
const IMPURE =
  /\b(window|document|fetch|localStorage|sessionStorage|AbortController|setTimeout|setInterval|process|globalThis|ReadableStream|TextDecoder)\b/;

const FEATURE_LAYERS = ["domain", "application", "adapters", "presentation"] as const;
type FeatureLayer = (typeof FEATURE_LAYERS)[number];
type Area = "shared" | "server" | "app" | "other";
type Place = { layer: FeatureLayer | Area; feature: string | null };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function place(src: string, file: string): Place {
  const rel = path.relative(src, file).split(path.sep).join("/");
  const match = rel.match(/^features\/([a-z-]+)\/(domain|application|adapters|presentation)\//);
  const layer = FEATURE_LAYERS.find((name) => name === match?.[2]);
  if (layer && match?.[1]) return { layer, feature: match[1] };
  if (rel.startsWith("shared/")) return { layer: "shared", feature: null };
  if (rel.startsWith("server/")) return { layer: "server", feature: null };
  if (rel.startsWith("app/")) return { layer: "app", feature: null };
  return { layer: "other", feature: null };
}

const ALLOWED: Record<Place["layer"], Place["layer"][]> = {
  domain: ["domain"],
  application: ["domain", "application"],
  adapters: ["domain", "application", "adapters"],
  presentation: ["domain", "application", "presentation", "shared"],
  shared: ["domain", "shared"],
  server: ["domain", "application", "adapters", "server", "shared"],
  app: ["domain", "application", "presentation", "shared", "server", "app"],
  other: ["domain", "application", "adapters", "presentation", "shared", "server", "app", "other"],
};

// Preserve quoted URLs while removing comments; a // inside a string is not a comment.
function withoutComments(text: string): string {
  return text.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (token) =>
      token.startsWith("//") || token.startsWith("/*") ? " ".repeat(token.length) : token,
  );
}

// Pure analysis accepts virtual files, so negative tests never alter application source.
export function checkBoundaries(modules: ReadonlyMap<string, string>, root: string): string[] {
  const src = path.join(root, "src");
  const problems: string[] = [];
  for (const [file, source] of modules) {
    const text = withoutComments(source);
    const from = place(src, file);
    const rel = path.relative(root, file);
    const featurePath = path.relative(src, file).split(path.sep).join("/").startsWith("features/");
    if (featurePath && from.layer === "other")
      problems.push(`${rel}: feature modules must belong to a recognized layer`);
    if (/NEXT_PUBLIC_/.test(source))
      problems.push(`${rel}: NEXT_PUBLIC_* configuration is not used by this app`);
    if ((from.layer === "domain" || from.layer === "application") && IMPURE.test(text))
      problems.push(`${rel}: ${from.layer} must stay pure (${text.match(IMPURE)?.[1]})`);
    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;
      if (specifier.startsWith("/") || /\.\.\/\.\.\/\.\.\/\.\.\/\.\./.test(specifier))
        problems.push(`${rel}: suspicious import ${specifier}`);
      const target = specifier.startsWith("@/")
        ? path.resolve(src, specifier.slice(2))
        : specifier.startsWith(".")
          ? path.resolve(path.dirname(file), specifier)
          : null;
      if (!target) {
        if (
          (from.layer === "domain" || from.layer === "application") &&
          specifier !== "server-only"
        )
          problems.push(`${rel}: ${from.layer} may not import package ${specifier}`);
        if (
          from.layer === "presentation" &&
          (specifier === "server-only" || specifier.startsWith("node:") || specifier === "pg")
        )
          problems.push(`${rel}: presentation may not import ${specifier}`);
        continue;
      }
      if (target !== src && !target.startsWith(`${src}${path.sep}`)) {
        problems.push(`${rel}: imports outside src (${specifier})`);
        continue;
      }
      const candidates = [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")];
      const resolved = candidates.find((candidate) => modules.has(candidate)) ?? target;
      const to = place(src, resolved);
      if (!ALLOWED[from.layer].includes(to.layer))
        problems.push(`${rel}: ${from.layer} may not import ${to.layer} (${specifier})`);
      else if (from.feature && to.feature && from.feature !== to.feature)
        problems.push(
          `${rel}: feature ${from.feature} may not import feature ${to.feature} (${specifier})`,
        );
      if (
        from.layer === "presentation" &&
        to.layer === "application" &&
        !/^(?:import|export)\s+type\b/.test(match[0].trim().replace(/^;\s*/, ""))
      )
        problems.push(`${rel}: presentation may only import application types (${specifier})`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, "..");
  const files = walk(path.join(root, "src"));
  const problems = checkBoundaries(
    new Map(files.map((file) => [file, readFileSync(file, "utf8")])),
    root,
  );
  for (const problem of problems) console.error(problem);
  console.log(`Boundaries: ${files.length} modules checked, ${problems.length} violations.`);
  if (problems.length) process.exitCode = 1;
}
