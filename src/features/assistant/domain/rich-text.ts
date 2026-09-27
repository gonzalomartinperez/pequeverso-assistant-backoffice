/**
 * Parser for the answer text format the API promises (`MessageOut.content`: plain text that may
 * contain **bold** and "- " list lines; API handoff: "never as HTML, never auto-linkify"). It
 * produces a small tree that presentation maps to React text elements — there is no HTML path and
 * no link path: URLs, `[label](url)` and markup stay literal text. Actionable links come only from
 * the structured `links`, `sources` and `products` fields. Pure and linear in input size, so the
 * streaming draft can be re-parsed on every delta.
 */

export type Inline = { kind: "text"; text: string } | { kind: "strong"; text: string };

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

const BULLET = /^\s*[-•*]\s+(.*)$/;
const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const BOLD = /\*\*([^*\n]+?)\*\*/g;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) nodes.push({ kind: "text", text: text.slice(last, match.index) });
    nodes.push({ kind: "strong", text: match[1] ?? "" });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ kind: "text", text: text.slice(last) });
  return nodes;
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    list = null;
  };
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    const item = bullet?.[1] ?? ordered?.[1];
    if (item !== undefined) {
      flushParagraph();
      const isOrdered = ordered !== null;
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(parseInline(item));
      continue;
    }
    flushList();
    paragraph.push(parseInline(line.trim()));
  }
  flushParagraph();
  flushList();
  return blocks;
}
