import { invitationState } from "@/features/auth/domain/access";
import { ConfirmAction } from "@/features/auth/presentation/confirm-action";
import { InviteForm } from "@/features/auth/presentation/invite-form";
import { when } from "@/features/operations/presentation/format";
import { accessDeps, requireActor } from "@/server/auth";
import { config } from "@/server/config";
import { Section, TableRegion, td, th } from "@/shared/ui/sections";
import { inviteAction, removeMemberAction, revokeInvitationAction } from "./actions";

const STATE_LABEL = {
  pending: "Pendiente",
  accepted: "Aceptada",
  revoked: "Revocada",
  expired: "Vencida",
} as const;

export default async function AccessPage() {
  const actor = await requireActor("manage_access");
  const deps = accessDeps();
  const [members, invitations] = await Promise.all([
    deps.store.listMembers(),
    deps.store.listInvitations(),
  ]);
  const now = new Date();
  const ownerEmail = config().ownerEmail;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading">Accesos</h1>
        <p className="text-small text-muted">
          Solo cuentas con un e-mail verificado por Google o GitHub. Quitar una cuenta cierra sus
          sesiones en la siguiente solicitud.
        </p>
      </header>
      <Section id="invite" title="Invitar a una persona">
        <InviteForm action={inviteAction} />
      </Section>
      <Section id="members" title="Cuentas con acceso">
        <TableRegion label="Cuentas con acceso">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  E-mail
                </th>
                <th scope="col" className={th}>
                  Rol
                </th>
                <th scope="col" className={th}>
                  Proveedores
                </th>
                <th scope="col" className={th}>
                  Sesiones activas
                </th>
                <th scope="col" className={th}>
                  Alta
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <th
                    scope="row"
                    className={`${td} text-left font-normal [overflow-wrap:anywhere]`}
                  >
                    {member.email}
                  </th>
                  <td className={td}>{member.role === "owner" ? "Propietario" : "Lectura"}</td>
                  <td className={td}>{member.providers.join(", ") || "—"}</td>
                  <td className={td}>{member.activeSessions}</td>
                  <td className={td}>{when(member.createdAt)}</td>
                  <td className={td}>
                    {member.id === actor.id ? (
                      <span className="text-tiny text-muted">Tu cuenta</span>
                    ) : member.email === ownerEmail ? (
                      <span className="text-tiny text-muted">Propietario configurado</span>
                    ) : (
                      <ConfirmAction
                        label="Quitar acceso"
                        subject={member.email}
                        title="¿Quitar el acceso?"
                        description="Se cierran sus sesiones de inmediato. Para volver a entrar necesitará una invitación nueva."
                        confirmLabel="Quitar acceso"
                        fallbackFocusId="members-title"
                        action={removeMemberAction.bind(null, member.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      </Section>
      <Section id="invitations" title="Invitaciones">
        {invitations.length === 0 ? (
          <p className="text-small text-copy">Todavía no creaste invitaciones.</p>
        ) : (
          <TableRegion label="Invitaciones">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    E-mail
                  </th>
                  <th scope="col" className={th}>
                    Rol
                  </th>
                  <th scope="col" className={th}>
                    Estado
                  </th>
                  <th scope="col" className={th}>
                    Vence
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const state = invitationState(invitation, now);
                  return (
                    <tr key={invitation.id}>
                      <th
                        scope="row"
                        className={`${td} text-left font-normal [overflow-wrap:anywhere]`}
                      >
                        {invitation.email}
                      </th>
                      <td className={td}>
                        {invitation.role === "owner" ? "Propietario" : "Lectura"}
                      </td>
                      <td className={td}>{STATE_LABEL[state]}</td>
                      <td className={td}>{when(invitation.expiresAt)}</td>
                      <td className={td}>
                        {state === "pending" ? (
                          <ConfirmAction
                            label="Revocar"
                            subject={invitation.email}
                            title="¿Revocar la invitación?"
                            description="El enlace deja de servir de inmediato."
                            confirmLabel="Revocar invitación"
                            fallbackFocusId="invitations-title"
                            action={revokeInvitationAction.bind(null, invitation.id)}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableRegion>
        )}
      </Section>
    </div>
  );
}
