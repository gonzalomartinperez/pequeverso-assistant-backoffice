// Validates agent skills: canonical procedures in .agents/skills (Codex) and thin adapters in
// .claude/skills (Claude Code) that point to them. Frontmatter is limited to name + description
// (single-line values), so it is parsed without a YAML dependency.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Meta = Record<string, string>;

const root = path.resolve(import.meta.dirname, "..");
const scripts = (
  JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;
const problems: string[] = [];
const fail = (message: string) => problems.push(message);

function parse(file: string): { meta: Meta; body: string } {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    fail(`${file}: missing frontmatter`);
    return { meta: {}, body: text };
  }
  const meta: Meta = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const field = line.match(/^([a-z]+):\s*(.*)$/);
    if (!field?.[1]) {
      fail(`${file}: unsupported frontmatter line "${line}"`);
      continue;
    }
    meta[field[1]] = (field[2] ?? "").replace(/^"(.*)"$/, "$1");
  }
  return { meta, body: match[2] ?? "" };
}

const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).sort() : []);
const canonical = list(path.join(root, ".agents/skills"));
const adapters = list(path.join(root, ".claude/skills"));
if (JSON.stringify(canonical) !== JSON.stringify(adapters))
  fail("skill catalogs differ between .agents and .claude");
if (!canonical.length) fail("no skills found");
if (readFileSync(path.join(root, "CLAUDE.md"), "utf8") !== "@AGENTS.md\n")
  fail("CLAUDE.md must be exactly @AGENTS.md");

for (const name of canonical) {
  const files = {
    canonical: path.join(root, ".agents/skills", name, "SKILL.md"),
    adapter: path.join(root, ".claude/skills", name, "SKILL.md"),
  };
  const parsed: Partial<Record<keyof typeof files, Meta>> = {};
  for (const [kind, file] of Object.entries(files) as [keyof typeof files, string][]) {
    if (!existsSync(file)) {
      fail(`${kind} skill missing: ${name}`);
      continue;
    }
    const { meta, body } = parse(file);
    parsed[kind] = meta;
    if (Object.keys(meta).sort().join(",") !== "description,name")
      fail(`${file}: frontmatter must contain only name and description`);
    if (meta.name !== name || !/^web-[a-z0-9-]{1,60}$/.test(meta.name ?? ""))
      fail(`${file}: name must match its folder and ^web-[a-z0-9-]+$`);
    const description = meta.description ?? "";
    if (description.length < 40 || description.length > 1024)
      fail(`${file}: description must be 40–1024 characters`);
    if (/\b(TODO|FIXME|TBD)\b|\/home\//.test(body))
      fail(`${file}: placeholder or absolute home path`);
    for (const [, target = ""] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      if (!existsSync(path.resolve(path.dirname(file), target.split("#")[0] ?? "")))
        fail(`${file}: broken link ${target}`);
    }
    for (const [, script = ""] of body.matchAll(/npm run ([a-z:-]+)/g))
      if (!scripts[script]) fail(`${file}: unknown npm script ${script}`);
    for (const [, script = ""] of body.matchAll(/`(scripts\/[\w./-]+)`/g))
      if (!existsSync(path.join(root, script))) fail(`${file}: missing ${script}`);
  }
  if (
    parsed.canonical &&
    parsed.adapter &&
    parsed.canonical.description !== parsed.adapter.description
  )
    fail(`${name}: adapter description differs from the canonical skill`);
  if (
    existsSync(files.adapter) &&
    !readFileSync(files.adapter, "utf8").includes(`.agents/skills/${name}/SKILL.md`)
  )
    fail(`${name}: adapter must point to the canonical skill`);
}
for (const problem of problems) console.error(problem);
console.log(`Skills: ${canonical.length} checked, ${problems.length} problems.`);
if (problems.length) process.exitCode = 1;
