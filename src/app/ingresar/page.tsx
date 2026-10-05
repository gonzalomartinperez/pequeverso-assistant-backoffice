import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeFrame } from "@/features/auth/presentation/backoffice-frame";
import { SignInPanel } from "@/features/auth/presentation/sign-in-panel";
import { authReady, currentActor, enabledProviders } from "@/server/auth";
import { Callout } from "@/shared/ui/callout";

export const metadata: Metadata = { title: "Ingresar · Backoffice Pequeverso" };

const ERRORS: Record<string, string> = {
  invitation_invalid: "La invitación no es válida, ya se usó o venció. Pide una nueva.",
  unable_to_create_user:
    "Esa cuenta no tiene acceso. Entra con el e-mail verificado que recibió la invitación, desde el enlace de la invitación.",
  account_not_linked:
    "Esa identidad no está vinculada a tu cuenta. Ingresa con la identidad habitual; el propietario puede vincular otra desde «Cuenta».",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ready = await authReady();
  if (ready) {
    let signedIn = false;
    try {
      signedIn = (await currentActor()) !== null;
    } catch {
      signedIn = false;
    }
    if (signedIn) redirect("/panel");
  }
  const error = typeof params.error === "string" ? params.error : null;
  const invited = params.invitacion === "1";
  const providers = ready ? enabledProviders() : [];
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
        {!ready || error === "unavailable" ? (
          <Callout tone="danger" role="alert" data-testid="sign-in-unavailable">
            <p>
              El acceso no está disponible en este momento. No es un problema de tu cuenta: vuelve a
              intentarlo más tarde.
            </p>
          </Callout>
        ) : null}
        {invited && ready ? (
          <Callout tone="info" role="status">
            <p>
              Tienes una invitación. Ingresa con la cuenta cuyo e-mail verificado recibió la
              invitación.
            </p>
          </Callout>
        ) : null}
        {error && error !== "unavailable" ? (
          <Callout tone="danger" role="alert" data-testid="sign-in-error">
            <p>
              {ERRORS[error] ??
                "No pudimos darte acceso con esa cuenta. Si te invitaron, usa el enlace de la invitación y el mismo e-mail."}
            </p>
          </Callout>
        ) : null}
        {ready ? <SignInPanel providers={providers} /> : null}
      </div>
    </BackofficeFrame>
  );
}
