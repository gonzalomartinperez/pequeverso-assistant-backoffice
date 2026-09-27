import { ChevronDown, ExternalLink, FileText, Info, MessageCircleQuestion } from "lucide-react";
import { Button, LinkButton } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import type { Link, Notice, Source } from "../domain/models";
import { usePresentation } from "./context";

export function Sources({ sources }: { sources: Source[] }) {
  const { t } = usePresentation();
  if (!sources.length) return null;
  return (
    <details className="group/sources rounded-md border border-line bg-surface-raised">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-small font-bold text-ink [&::-webkit-details-marker]:hidden">
        <FileText aria-hidden="true" className="size-4 text-icon" />
        <span>{t.sourcesLabel(sources.length)}</span>
        <span className="sr-only">. {t.sourcesHint}</span>
        <ChevronDown
          aria-hidden="true"
          className="ms-auto size-4 text-muted transition-transform duration-150 group-open/sources:rotate-180"
        />
      </summary>
      <ul className="flex flex-col gap-1 border-t border-line px-3 py-2">
        {sources.map((source) => (
          <li key={source.id}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 text-small font-bold text-link underline decoration-1 underline-offset-3 hover:text-link-hover"
            >
              {source.title}
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="sr-only">{t.opensInNewTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Links({ links }: { links: Link[] }) {
  const { t } = usePresentation();
  if (!links.length) return null;
  return (
    <nav aria-label={t.linksLabel}>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.id}>
            <LinkButton
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="sm"
            >
              {link.label}
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">{t.opensInNewTab}</span>
            </LinkButton>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FollowUps({
  items,
  disabled,
  onSelect,
}: {
  items: string[];
  disabled: boolean;
  onSelect: (question: string) => void;
}) {
  const { t } = usePresentation();
  if (!items.length) return null;
  return (
    <section aria-label={t.followUpsLabel} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-sans text-tiny font-extrabold tracking-wide text-muted uppercase">
        <MessageCircleQuestion aria-hidden="true" className="size-4 text-icon" />
        {t.followUpsLabel}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item} className="max-w-full">
            <Button
              variant="chip"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(item)}
              className="h-auto max-w-full py-2 whitespace-normal"
            >
              {item}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Per the API handoff, only redacted contact data needs extra UI: a refused payment message is
 * explained in the answer text, and a replaced answer needs no notice.
 */
const SHOWN_NOTICES: readonly Notice[] = ["contact_data_redacted"];

export function Notices({ notices }: { notices: Notice[] }) {
  const { t } = usePresentation();
  const shown = notices.filter((notice) => SHOWN_NOTICES.includes(notice));
  if (!shown.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {shown.map((notice) => (
        <Callout key={notice} tone="notice">
          <Info aria-hidden="true" />
          <p>{t.notices[notice]}</p>
        </Callout>
      ))}
    </div>
  );
}
