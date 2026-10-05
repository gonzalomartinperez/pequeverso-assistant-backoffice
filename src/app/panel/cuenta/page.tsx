import { LinkProviderButton } from "@/features/auth/presentation/account-controls";
import { accessDeps, enabledProviders, requireActor } from "@/server/auth";
import { Section } from "@/shared/ui/sections";

export default async function AccountPage() {
  const actor = await requireActor("read_operations");
  const member = await accessDeps().store.memberByEmail(actor.email);
  const linked = new Set(member?.providers ?? []);
  // Explicit linking is offered to owners only (Better Auth's /link-social is also refused
  // server-side for anyone else).
  const available =
    actor.role === "owner" ? enabledProviders().filter((provider) => !linked.has(provider.id)) : [];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading">Tu cuenta</h1>
      <Section
        id="identities"
        title="Identidades vinculadas"
        description="Vincular es siempre explícito, solo para propietarios, y solo acepta otra identidad con el mismo e-mail verificado."
      >
        <p className="text-small text-copy">
          {actor.email}: {[...linked].join(", ") || "sin identidades"}.
        </p>
        {available.length ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {available.map((provider) => (
              <LinkProviderButton key={provider.id} provider={provider.id} label={provider.label} />
            ))}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
