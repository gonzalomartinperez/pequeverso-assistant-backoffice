"use client";
import { Link2, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { authClient } from "./auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.assign("/ingresar");
      }}
    >
      <LogOut aria-hidden="true" />
      Salir
    </Button>
  );
}

/**
 * Explicit linking of another provider to the signed-in account. Better Auth only links an
 * identity whose verified e-mail equals this account's e-mail (different e-mails are refused).
 */
export function LinkProviderButton({ provider, label }: { provider: string; label: string }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={state === "pending"}
        onClick={async () => {
          setState("pending");
          const result = await authClient.linkSocial({ provider, callbackURL: "/panel/cuenta" });
          if (result.error) setState("failed");
        }}
      >
        <Link2 aria-hidden="true" />
        Vincular {label}
      </Button>
      {state === "failed" ? (
        <p role="alert" className="text-tiny text-danger">
          No se pudo vincular. La cuenta debe usar el mismo e-mail verificado.
        </p>
      ) : null}
    </div>
  );
}
