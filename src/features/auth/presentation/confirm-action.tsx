"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";

/**
 * Destructive action behind a native modal dialog: focus moves into the dialog, Escape cancels,
 * and focus returns to the trigger (or, if the row disappeared, to the section heading).
 * The server action re-checks the caller's role; this control is only the confirmation step.
 */
export function ConfirmAction({
  label,
  subject,
  title,
  description,
  confirmLabel,
  fallbackFocusId,
  action,
}: {
  label: string;
  subject: string;
  title: string;
  description: string;
  confirmLabel: string;
  fallbackFocusId: string;
  action: () => Promise<{ ok: boolean }>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // After a successful action the trigger's row is about to change or disappear, so focus goes to
  // the section heading; after a cancel it returns to the trigger.
  const succeeded = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const fallbackId = useRef(fallbackFocusId);
  fallbackId.current = fallbackFocusId;

  function focusHeading() {
    focusById(fallbackId.current);
  }

  // The server action's response can re-render the table and unmount this row before the dialog's
  // close event runs; in that case focus still has to land on the section heading, not on <body>.
  useEffect(() => {
    return () => {
      if (succeeded.current) focusById(fallbackId.current);
    };
  }, []);

  function restoreFocus() {
    const toHeading = succeeded.current;
    succeeded.current = false;
    if (toHeading || !trigger.current?.isConnected) {
      focusHeading();
      return;
    }
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function confirm() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await action();
      if (!result.ok) throw new Error("refused");
      succeeded.current = true;
      dialog.current?.close();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        onClick={() => {
          setFailed(false);
          dialog.current?.showModal();
        }}
      >
        {label}
        <span className="sr-only"> {subject}</span>
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={restoreFocus}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-raised p-6 text-copy shadow-md backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-3">
          <h2 id={titleId} className="text-title">
            {title}
          </h2>
          <p className="font-extrabold text-ink [overflow-wrap:anywhere]">{subject}</p>
          <p className="text-small">{description}</p>
          {failed ? (
            <p role="alert" className="text-small text-danger">
              No se pudo completar. Recarga la página y vuelve a intentarlo.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button size="sm" disabled={pending} aria-busy={pending} onClick={() => void confirm()}>
              {pending ? "Procesando…" : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function focusById(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}
