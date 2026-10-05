"use client";
import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { authClient } from "./auth-client";

export type ProviderOption = { id: string; label: string };

/** Starts an OAuth sign-in. Nothing is stored in the browser; the server sets HttpOnly cookies. */
export function SignInPanel({ providers }: { providers: ProviderOption[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Buttons stay disabled until hydrated, so an early click is never silently lost.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function start(provider: string) {
    setPending(provider);
    setFailed(false);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: "/panel",
      errorCallbackURL: "/ingresar",
    });
    if (result.error) {
      setFailed(true);
      setPending(null);
    }
  }

  if (!providers.length)
    return (
      <Callout tone="danger" role="alert">
        <p>No hay proveedores de identidad configurados en este entorno.</p>
      </Callout>
    );

  return (
    <div className="flex flex-col gap-3" data-ready={ready}>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          variant="outline"
          disabled={!ready || pending !== null}
          aria-busy={pending === provider.id}
          onClick={() => void start(provider.id)}
        >
          <LogIn aria-hidden="true" />
          Continuar con {provider.label}
        </Button>
      ))}
      {failed ? (
        <p role="alert" className="text-small text-danger">
          No pudimos iniciar el ingreso. Vuelve a intentarlo.
        </p>
      ) : null}
    </div>
  );
}
