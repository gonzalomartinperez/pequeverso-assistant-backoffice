"use client";
import { ArrowDown } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { usePresentation } from "./context";

const STICK_THRESHOLD_PX = 72;

/**
 * Scrollable conversation. It follows new content only while the reader is already at the
 * bottom; scrolling up to reread stops following until the reader returns or sends a question
 * (`followSignal`). Growth is observed with a ResizeObserver, so streaming does not add scroll
 * work per token beyond one layout read when the content actually grows.
 */
export function Transcript({
  children,
  followSignal,
  busy,
}: {
  children: ReactNode;
  followSignal: number;
  busy: boolean;
}) {
  const { t } = usePresentation();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const toBottom = useCallback((smooth = false) => {
    const element = scroller.current;
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: smooth && !reduce ? "smooth" : "auto",
    });
  }, []);

  useLayoutEffect(() => {
    // Restored history opens at the latest message.
    toBottom();
  }, [toBottom]);

  useEffect(() => {
    // Sending a question is an explicit request to see the answer.
    if (followSignal === 0) return;
    stick.current = true;
    setShowJump(false);
    toBottom();
  }, [followSignal, toBottom]);

  useEffect(() => {
    const element = scroller.current;
    const inner = content.current;
    if (!element || !inner) return;
    // Only a scroll *up* by the reader stops following; content growing between a programmatic
    // scroll and its event must not be mistaken for the reader leaving the bottom.
    let lastTop = element.scrollTop;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance <= STICK_THRESHOLD_PX) stick.current = true;
      else if (element.scrollTop < lastTop) stick.current = false;
      lastTop = element.scrollTop;
      setShowJump(!stick.current);
    };
    const observer = new ResizeObserver(() => {
      if (stick.current) toBottom();
      else setShowJump(true);
    });
    element.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(inner);
    return () => {
      element.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [toBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        className="@container/transcript h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [touch-action:pan-y]"
      >
        <ol
          ref={content}
          aria-label={t.transcriptLabel}
          aria-busy={busy || undefined}
          className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5 @lg/transcript:px-6"
        >
          {children}
        </ol>
      </div>
      {showJump && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            variant="action"
            size="sm"
            className="pointer-events-auto shadow-md motion-safe:animate-enter"
            onClick={() => {
              stick.current = true;
              setShowJump(false);
              toBottom(true);
            }}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
            {t.newMessages}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Polite status announcements for state changes (not tokens). Silent while the host keeps the
 * panel hidden; the host is told about unread answers through the embed protocol instead.
 */
export function Announcer({ message }: { message: string }) {
  const { visible } = usePresentation();
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {visible ? message : ""}
    </p>
  );
}
