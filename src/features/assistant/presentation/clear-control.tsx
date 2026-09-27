"use client";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { usePresentation } from "./context";

/**
 * "New conversation" with an inline, non-modal confirmation (deleting history is irreversible).
 * Escape closes the confirmation only — it is stopped so the embed does not also minimize.
 */
export function ClearControl({
  disabled,
  clearing,
  onConfirm,
}: {
  disabled: boolean;
  clearing: boolean;
  onConfirm: () => void;
}) {
  const { t } = usePresentation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !box.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="relative">
      <IconButton
        ref={trigger}
        label={clearing ? t.clearing : t.clear}
        disabled={disabled || clearing}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquarePlus aria-hidden="true" />
      </IconButton>
      {open && (
        <div
          ref={box}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          className="absolute end-0 top-full z-40 mt-2 flex w-64 flex-col gap-3 rounded-md border border-line bg-surface-raised p-4 shadow-md motion-safe:animate-enter"
        >
          <div className="flex flex-col gap-1">
            <p id={titleId} className="font-bold text-ink">
              {t.clearConfirmTitle}
            </p>
            <p className="text-small text-copy">{t.clearConfirmBody}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button ref={cancel} variant="ghost" size="sm" onClick={close}>
              {t.clearCancel}
            </Button>
            <Button
              variant="action"
              size="sm"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {t.clearConfirm}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
