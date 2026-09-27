import { AlertCircle, CircleStop, RotateCcw, WifiOff, X } from "lucide-react";
import { memo } from "react";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { cn } from "@/shared/ui/cn";
import type { Outcome, Pending } from "../domain/conversation";
import type { ErrorCode, Message } from "../domain/models";
import { FollowUps, Links, Notices, Sources } from "./answer-extras";
import { BrandMark } from "./brand-mark";
import { usePresentation } from "./context";
import { ProductSection } from "./products";
import { RichTextView } from "./rich-text-view";

function UserMessage({ message, enter = false }: { message: Message; enter?: boolean }) {
  const { t } = usePresentation();
  return (
    <li className={cn("flex justify-end", enter && "motion-safe:animate-enter")}>
      <div className="max-w-[85%] rounded-lg rounded-br-sm bg-surface-user px-4 py-2.5 text-on-user shadow-sm">
        <h2 className="sr-only">{t.you}</h2>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </li>
  );
}

function AssistantFrame({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  const { t } = usePresentation();
  return (
    <li className="flex gap-3" aria-busy={busy || undefined}>
      <BrandMark size={32} className="mt-0.5 hidden self-start @md/transcript:block" />
      <div className="flex min-w-0 max-w-measure flex-1 flex-col gap-4">
        <h2 className="sr-only">{t.assistant}</h2>
        {children}
      </div>
    </li>
  );
}

type AssistantMessageProps = {
  message: Message;
  followUps: boolean;
  onFollowUp: (question: string) => void;
};

const AssistantMessage = memo(function AssistantMessage({
  message,
  followUps,
  onFollowUp,
}: AssistantMessageProps) {
  return (
    <AssistantFrame>
      {/* No entrance motion: the final answer replaces the visible draft in place. */}
      <div className="flex flex-col gap-4">
        {message.content && <RichTextView text={message.content} />}
        <Notices notices={message.notices} />
        <ProductSection products={message.products} resources={message.resources} />
        <Links links={message.links} />
        <Sources sources={message.sources} />
        {followUps && (
          <FollowUps items={message.followUps} disabled={false} onSelect={onFollowUp} />
        )}
      </div>
    </AssistantFrame>
  );
});

type MessageListProps = {
  messages: Message[];
  /** Follow-ups are offered only on the latest answer and only while a question can be sent. */
  followUpsEnabled: boolean;
  onFollowUp: (question: string) => void;
};

/**
 * Committed transcript. Its props do not change while an answer streams (the reducer keeps the
 * same `messages` array), so tokens re-render only the streaming draft below it.
 */
export const MessageList = memo(function MessageList({
  messages,
  followUpsEnabled,
  onFollowUp,
}: MessageListProps) {
  const last = messages.at(-1);
  return (
    <>
      {messages.map((message) =>
        message.role === "user" ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            followUps={followUpsEnabled && message === last}
            onFollowUp={onFollowUp}
          />
        ),
      )}
    </>
  );
});

export function PendingQuestion({ pending }: { pending: Pending }) {
  return pending.question ? <UserMessage message={pending.question} enter /> : null;
}

/** The live draft: same renderer as the final answer, so completion causes no reflow of format. */
export function StreamingAnswer({ pending }: { pending: Pending }) {
  const { t } = usePresentation();
  if (pending.answered) return null;
  return (
    <AssistantFrame busy>
      {pending.draft ? (
        <div className="relative">
          <RichTextView text={pending.draft} />
          {!pending.stopping && (
            <span
              aria-hidden="true"
              className="ms-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-caret align-baseline motion-safe:animate-caret"
            />
          )}
        </div>
      ) : (
        <p className="flex min-h-7 items-center gap-2 text-small text-muted">
          <span aria-hidden="true" className="flex gap-1">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1.5 rounded-full bg-icon motion-safe:animate-pulse-dot"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </span>
          {pending.stopping ? t.stopping : t.thinking}
        </p>
      )}
    </AssistantFrame>
  );
}

function outcomeCopy(outcome: Outcome, t: ReturnType<typeof usePresentation>["t"]) {
  if (outcome.kind === "cancelled")
    return { title: t.cancelledTitle, detail: null, Icon: CircleStop };
  if (outcome.kind === "interrupted")
    return { title: t.interruptedTitle, detail: null, Icon: WifiOff };
  return { title: t.failedTitle, detail: t.errors[outcome.code], Icon: AlertCircle };
}

export function OutcomeView({
  outcome,
  canRetry,
  onRetry,
  onDismiss,
}: {
  outcome: Outcome;
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { t } = usePresentation();
  const { title, detail, Icon } = outcomeCopy(outcome, t);
  const retryable = outcome.kind !== "failed" || outcome.retryable;
  return (
    <AssistantFrame>
      {outcome.partial && (
        <div className="flex flex-col gap-2">
          <p className="font-sans text-tiny font-extrabold tracking-wide text-muted uppercase">
            {t.partialLabel}
          </p>
          <RichTextView
            text={outcome.partial}
            className="border-s-2 border-line-strong ps-3 opacity-80"
          />
        </div>
      )}
      <Callout tone={outcome.kind === "cancelled" ? "info" : "danger"} className="items-center">
        <Icon aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-bold text-ink">{title}</p>
          {detail && <p>{detail}</p>}
        </div>
      </Callout>
      <div className="flex flex-wrap gap-2">
        {retryable && (
          <Button variant="action" size="sm" onClick={onRetry} disabled={!canRetry}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {t.retry}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          <X aria-hidden="true" className="size-4" />
          {t.dismiss}
        </Button>
      </div>
    </AssistantFrame>
  );
}

export function RefusalView({ code, onDismiss }: { code: ErrorCode; onDismiss: () => void }) {
  const { t } = usePresentation();
  return (
    <li>
      <Callout tone="danger" className="items-center">
        <AlertCircle aria-hidden="true" />
        <p className="flex-1">{t.errors[code]}</p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.dismiss}
          onClick={onDismiss}
          className="-my-2 -me-2"
        >
          <X aria-hidden="true" />
        </Button>
      </Callout>
    </li>
  );
}
