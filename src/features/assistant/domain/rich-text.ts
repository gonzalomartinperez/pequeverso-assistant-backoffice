/**
 * Parser for the answer text format the API promises (`MessageOut.content`: plain text that may
 * contain **bold** and "- " list lines). It produces a small tree that presentation maps to React
 * elements — there is no HTML path at all. Links written as `[label](url)` or bare `https://…`
 * become link nodes; whether a link is rendered as a link is decided by the URL policy later.
 * Pure and linear in input size, so the streaming draft can be re-parsed on every delta.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "link"; label: string; url: string };

export type Block =
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

const BULLET = /^\s*[-•*]\s+(.*)$/;
const ORDERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const TOKEN =
  /\*\*([^*]+?)\*\*|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)|(https?:\/\/[^\s<>()]{1,2000})/g;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index;
    if (index > last) nodes.push({ kind: "text", text: text.slice(last, index) });
    const [whole, bold, label, labelled, bare] = match;
    if (bold !== undefined) nodes.push({ kind: "strong", children: parseInline(bold) });
    else if (label !== undefined && labelled !== undefined)
      nodes.push({ kind: "link", label, url: labelled });
    else if (bare !== undefined) {
      // Trailing sentence punctuation is not part of a bare URL.
      const url = bare.replace(/[.,;:!?]+$/, "");
      nodes.push({ kind: "link", label: url, url });
      if (url.length < bare.length) nodes.push({ kind: "text", text: bare.slice(url.length) });
    }
    last = index + whole.length;
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
