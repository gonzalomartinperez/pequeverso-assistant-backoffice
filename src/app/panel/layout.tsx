import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/presentation/account-controls";
import { BackofficeFrame } from "@/features/auth/presentation/backoffice-frame";
import { PanelNav } from "@/features/auth/presentation/panel-nav";
import { requireActor } from "@/server/auth";

export const metadata: Metadata = {
  title: "Backoffice · Asistente Pequeverso",
  robots: { index: false, follow: false },
};

/** Every page under /panel requires an account with a role; the role is re-read per request. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor("read_operations");
  return (
    <BackofficeFrame
      nav={<PanelNav owner={actor.role === "owner"} />}
      account={
        <>
          <span
            className="hidden max-w-56 truncate text-tiny text-muted sm:inline"
            data-testid="actor"
          >
            {actor.email} · {actor.role === "owner" ? "propietario" : "lectura"}
          </span>
          <span className="text-tiny text-muted sm:hidden" data-testid="actor-role">
            {actor.role === "owner" ? "Propietario" : "Lectura"}
          </span>
          <SignOutButton />
        </>
      }
    >
      {children}
    </BackofficeFrame>
  );
}
