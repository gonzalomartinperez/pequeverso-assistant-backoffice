"use client";
import { ArrowUp, Square } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/shared/ui/cn";
import { IconButton } from "@/shared/ui/icon-button";
import { usePresentation } from "./context";

const MAX_HEIGHT_PX = 144; // ≈ 5 lines; the transcript keeps the remaining height

type Props = {
  canSubmit: boolean;
  running: boolean;
  stopping: boolean;
  maxChars: number;
  /** Returns false when the controller refused to start (the text stays in the composer). */
  onSubmit: (text: string) => boolean;
  onStop: () => void;
  /** Question returned after a refusal; a new nonce restores it again. */
  restore: { text: string; nonce: number } | null;
  /** Increments when the composer should take focus (host focus request, starter chosen, …). */
  focusSignal: number;
};

export function Composer({
  canSubmit,
  running,
  stopping,
  maxChars,
  onSubmit,
  onStop,
  restore,
  focusSignal,
}: Props) {
  const { t, visible } = usePresentation();
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const counterId = useId();
  const remaining = maxChars - draft.length;
  const tooLong = remaining < 0;
  const sendable = canSubmit && draft.trim().length > 0 && !tooLong;

  useEffect(() => {
    if (restore) setDraft(restore.text);
  }, [restore]);

  useEffect(() => {
    // On touch devices focusing the field would pop the virtual keyboard over the answer, so
    // focus moves only for keyboard/mouse users; touch users tap the field when ready.
    if (focusSignal === 0 || !visible || window.matchMedia("(pointer: coarse)").matches) return;
    field.current?.focus({ preventScroll: true });
  }, [focusSignal, visible]);

  // Grow with the text up to the cap; measured after render so typing never jumps.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!sendable) return;
    if (onSubmit(draft)) setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line; never while an IME composition is active.
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    event.preventDefault();
    if (!running) submit();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-surface-raised p-1.5 ps-4 shadow-sm transition-[border-color,box-shadow] duration-150",
          "focus-within:border-ring focus-within:shadow-md",
          tooLong ? "border-danger" : "border-line-strong",
        )}
      >
        <label htmlFor={`${hintId}-field`} className="sr-only">
          {t.composerLabel}
        </label>
        <textarea
          id={`${hintId}-field`}
          ref={field}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.composerPlaceholder}
          enterKeyHint="send"
          autoComplete="off"
          aria-describedby={`${hintId} ${counterId}`}
          aria-invalid={tooLong || undefined}
          className="max-h-36 min-h-11 flex-1 resize-none self-center bg-transparent py-2.5 text-body leading-6 text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
        {running ? (
          <IconButton
            label={stopping ? t.stopping : t.stop}
            tooltipSide="top"
            variant="outline"
            onClick={onStop}
            disabled={stopping}
            className="border-ink"
          >
            <Square aria-hidden="true" className="size-4 fill-current" />
          </IconButton>
        ) : (
          <IconButton
            label={t.send}
            tooltipSide="top"
            variant="action"
            type="submit"
            disabled={!sendable}
          >
            <ArrowUp aria-hidden="true" />
          </IconButton>
        )}
      </div>
      <div
        className={cn(
          "min-h-5 items-start justify-between gap-3 px-2 text-tiny text-muted",
          remaining <= 100 ? "flex" : "hidden pointer-fine:flex",
        )}
      >
        <p id={hintId} className="hidden pointer-fine:block">
          {t.composerHint}
        </p>
        <p
          id={counterId}
          aria-live="polite"
          className={cn("ms-auto tabular-nums", tooLong && "font-bold text-danger")}
        >
          {tooLong ? t.tooLong(maxChars) : remaining <= 100 ? t.charactersLeft(remaining) : ""}
        </p>
      </div>
    </form>
  );
}
