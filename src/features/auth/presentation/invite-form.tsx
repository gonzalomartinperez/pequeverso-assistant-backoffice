"use client";
import { Check, Copy, UserPlus } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; email: string; role: string; expiresAt: string; link: string };

const field =
  "min-h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-body text-ink";

/**
 * Creates an invitation. The one-time link is shown only in this response and is never stored in
 * clear text: if it is lost, revoke it and create another.
 */
export function InviteForm({
  action,
}: {
  action: (state: InviteState, form: FormData) => Promise<InviteState>;
}) {
  const [state, submit, pending] = useActionState(action, { status: "idle" });
  const emailId = useId();
  const roleId = useId();
  return (
    <div className="flex flex-col gap-4">
      <form action={submit} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={emailId} className="text-small font-extrabold text-ink">
            E-mail verificado de la persona
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="off"
            maxLength={254}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={roleId} className="text-small font-extrabold text-ink">
            Rol
          </label>
          <select id={roleId} name="role" defaultValue="viewer" className={field}>
            <option value="viewer">Lectura (viewer)</option>
            <option value="owner">Propietario (owner)</option>
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
          <UserPlus aria-hidden="true" />
          Crear invitación
        </Button>
      </form>
      <div aria-live="polite">
        {state.status === "error" ? (
          <Callout tone="danger" role="alert">
            <p>{state.message}</p>
          </Callout>
        ) : null}
        {state.status === "created" ? (
          <Callout tone="notice" data-testid="invitation-created">
            <div className="flex min-w-0 flex-col gap-2">
              <p>
                Invitación para <strong>{state.email}</strong> ({state.role}). Vence el{" "}
                {new Date(state.expiresAt).toLocaleString("es", { timeZone: "UTC" })} UTC y sirve
                una sola vez. Este enlace no se vuelve a mostrar: envíalo por un canal privado.
              </p>
              <code
                className="block rounded-sm bg-surface-raised px-2 py-1 text-tiny [overflow-wrap:anywhere]"
                data-testid="invitation-link"
              >
                {state.link}
              </code>
              <CopyLink key={state.link} link={state.link} />
            </div>
          </Callout>
        ) : null}
      </div>
    </div>
  );
}

/** Copy feedback belongs to one link: a new invitation remounts it, so "Copiado" never lingers. */
function CopyLink({ link }: { link: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {state === "copied" ? "Copiado" : "Copiar enlace"}
      </Button>
      <span role="status" className="text-tiny">
        {state === "failed" ? "No se pudo copiar; selecciona el enlace y cópialo a mano." : ""}
      </span>
    </div>
  );
}
