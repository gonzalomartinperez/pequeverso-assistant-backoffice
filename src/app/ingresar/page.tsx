import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeFrame } from "@/features/auth/presentation/backoffice-frame";
import { SignInPanel } from "@/features/auth/presentation/sign-in-panel";
import { currentActor, enabledProviders } from "@/server/auth";
import { Callout } from "@/shared/ui/callout";

export const metadata: Metadata = { title: "Ingresar · Backoffice Pequeverso" };

const ERRORS: Record<string, string> = {
  invitation_invalid: "La invitación no es válida, ya se usó o venció. Pide una nueva.",
  unable_to_create_user:
    "Esa cuenta no tiene acceso. Entra con el e-mail verificado que recibió la invitación, desde el enlace de la invitación.",
  account_not_linked:
    "Esa identidad no está vinculada a tu cuenta. Ingresa con la identidad habitual y vincúlala desde «Cuenta».",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await currentActor()) redirect("/panel");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const invited = params.invitacion === "1";
  return (
    <BackofficeFrame>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-heading">Backoffice del asistente</h1>
          <p className="text-small text-copy">
            Acceso privado para operar el asistente de Pequeverso. No hay registro público: entra
            solo el propietario configurado y las personas invitadas.
          </p>
        </header>
        {invited ? (
          <Callout tone="info" role="status">
            <p>
              Tienes una invitación. Ingresa con la cuenta cuyo e-mail verificado recibió la
              invitación.
            </p>
          </Callout>
        ) : null}
        {error ? (
          <Callout tone="danger" role="alert" data-testid="sign-in-error">
            <p>
              {ERRORS[error] ??
                "No pudimos darte acceso con esa cuenta. Si te invitaron, usa el enlace de la invitación y el mismo e-mail."}
            </p>
          </Callout>
        ) : null}
        <SignInPanel providers={enabledProviders()} />
      </div>
    </BackofficeFrame>
  );
}
