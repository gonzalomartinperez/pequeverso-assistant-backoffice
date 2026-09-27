import { memo, type ReactNode } from "react";
import { cn } from "@/shared/ui/cn";
import { answerLinkUrl, type LinkPolicy } from "../domain/links";
import { type Inline, parseRichText } from "../domain/rich-text";

function inline(nodes: Inline[], policy: LinkPolicy, newTab: string): ReactNode[] {
  return nodes.map((node, index) => {
    // Static text positions: index keys are stable for a given text.
    const key = index;
    if (node.kind === "text") return node.text;
    if (node.kind === "strong")
      return <strong key={key}>{inline(node.children, policy, newTab)}</strong>;
    const url = answerLinkUrl(node.url, policy);
    if (!url) return node.label;
    return (
      <a
        key={key}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-link underline decoration-1 underline-offset-3 hover:text-link-hover"
      >
        {node.label}
        <span className="sr-only"> {newTab}</span>
      </a>
    );
  });
}

type Props = { text: string; policy: LinkPolicy; newTab: string; className?: string };

/** Renders the API's text format as React elements only; links pass the URL policy or stay text. */
export const RichTextView = memo(function RichTextView({ text, policy, newTab, className }: Props) {
  const blocks = parseRichText(text);
  return (
    <div className={cn("flex flex-col gap-3 break-words text-body text-copy", className)}>
      {blocks.map((block, index) => {
        const key = index;
        if (block.kind === "paragraph")
          return (
            <p key={key}>
              {block.lines.map((line, lineIndex) => {
                const lineKey = lineIndex;
                return (
                  <span key={lineKey}>
                    {lineIndex > 0 && <br />}
                    {inline(line, policy, newTab)}
                  </span>
                );
              })}
            </p>
          );
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={key}
            className={cn(
              "flex flex-col gap-1.5 ps-5",
              block.ordered ? "list-decimal" : "list-disc marker:text-icon",
            )}
          >
            {block.items.map((item, itemIndex) => {
              const itemKey = itemIndex;
              return (
                <li key={itemKey} className="ps-1">
                  {inline(item, policy, newTab)}
                </li>
              );
            })}
          </List>
        );
      })}
    </div>
  );
});
