# ADR 003 — Owned renderer for the API's plain-text answers

**Status:** accepted (2026-09-27)

**Context.** The API contract states that `content` is plain text that may contain `**bold**` and
`- ` list lines, to be rendered as text and never as HTML. A Markdown library would accept far more
syntax than promised and would render only completed messages, causing a format jump at completion.

**Decision.** `domain/rich-text.ts` parses paragraphs, bold and bullet/numbered lists into a small
tree; `RichTextView` maps it to React text elements. Nothing in answer text becomes a link — not
bare URLs, not Markdown-style links — as the API's committed handoff requires ("never auto-linkify");
actionable links come only from the structured `links`, `sources` and `products` fields. The
streaming draft and the final answer use the same renderer.

**Consequences.** No HTML or link path and no Markdown dependency; linear-time parsing on every delta. If the
API contract ever promises richer formatting, this ADR must be revisited.
