"use client";
import { Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Callout } from "@/shared/ui/callout";
import type { Assistant } from "../application/assistant";
import { type ConversationState, canSubmit } from "../domain/conversation";
import { Composer } from "./composer";
import { usePresentation } from "./context";
import { EmptyState } from "./empty-state";
import {
  MessageList,
  OutcomeView,
  PendingQuestion,
  RefusalView,
  StreamingAnswer,
} from "./messages";
import { Connecting, Offline, Unavailable } from "./panel-states";
import { Announcer, Transcript } from "./transcript";

/** Derives one polite announcement per state change (never per token). */
function useAnnouncement(state: ConversationState): string {
  const { t } = usePresentation();
  const [message, setMessage] = useState("");
  const previous = useRef(state);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (!before.pending && state.pending) setMessage(t.thinking);
    else if (before.pending && !state.pending) {
      if (state.outcome?.kind === "cancelled") setMessage(t.answerStopped);
      else if (state.outcome?.kind === "interrupted") setMessage(t.answerInterrupted);
      else if (state.outcome?.kind === "failed") setMessage(t.answerFailed);
      else if (state.messages.at(-1)?.role === "assistant") setMessage(t.answerReady);
    }
  }, [state, t]);
  return message;
}

/**
 * The single conversation implementation, shared by the embedded and standalone shells. Shells
 * add only their header and outer layout.
 */
export function ConversationView({
  assistant,
  state,
  focusSignal,
}: {
  assistant: Assistant;
  state: ConversationState;
  focusSignal: number;
}) {
  const { t } = usePresentation();
  const [follow, setFollow] = useState(0);
  const [localFocus, setLocalFocus] = useState(0);
  const announcement = useAnnouncement(state);
  const ready = canSubmit(state);

  const ask = useCallback(
    (question: string) => {
      const sent = assistant.submit(question);
      if (sent) setFollow((value) => value + 1);
      return sent;
    },
    [assistant],
  );
  const askAndFocus = useCallback(
    (question: string) => {
      if (ask(question)) setLocalFocus((value) => value + 1);
    },
    [ask],
  );

  // After the conversation is cleared, focus returns to the composer instead of a disabled button.
  const wasClearing = useRef(false);
  useEffect(() => {
    if (wasClearing.current && !state.clearing) setLocalFocus((value) => value + 1);
    wasClearing.current = state.clearing;
  }, [state.clearing]);

  if (state.session === "opening" && state.messages.length === 0) return <Connecting />;
  if (state.session === "failed" && state.availability.status === "available")
    return <Offline onReconnect={assistant.reconnect} busy={false} />;

  const pending = state.pending;
  const empty = state.messages.length === 0 && !pending && !state.outcome;
  return (
    <>
      <Transcript followSignal={follow} busy={pending !== null}>
        {empty && state.availability.status === "available" && (
          <EmptyState disabled={!ready} onAsk={askAndFocus} />
        )}
        {state.notice === "expired" && (
          <li>
            <Callout tone="notice">
              <Info aria-hidden="true" />
              <p>{t.expiredNotice}</p>
            </Callout>
          </li>
        )}
        <MessageList
          messages={state.messages}
          followUpsEnabled={ready && !state.outcome}
          onFollowUp={askAndFocus}
        />
        {pending && <PendingQuestion pending={pending} />}
        {pending && <StreamingAnswer pending={pending} />}
        {state.outcome && !pending && (
          <OutcomeView
            outcome={state.outcome}
            canRetry={ready}
            onRetry={() => {
              if (assistant.retry()) setFollow((value) => value + 1);
            }}
            onDismiss={assistant.dismiss}
          />
        )}
        {state.refusal && !pending && (
          <RefusalView code={state.refusal} onDismiss={assistant.dismiss} />
        )}
      </Transcript>
      <div className="border-t border-line bg-veil px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-sm @container/composer">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {state.availability.status === "unavailable" ? (
            <Unavailable availability={state.availability} />
          ) : (
            <Composer
              canSubmit={ready}
              running={pending !== null}
              stopping={pending?.stopping ?? false}
              maxChars={state.limits?.maxMessageChars ?? 600}
              onSubmit={ask}
              onStop={assistant.stop}
              restore={state.restore}
              focusSignal={focusSignal + localFocus}
            />
          )}
        </div>
      </div>
      <Announcer message={announcement} />
    </>
  );
}
