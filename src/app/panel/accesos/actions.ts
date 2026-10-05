"use server";
import { revalidatePath } from "next/cache";
import { inviteMember, removeMember, revokeInvitation } from "@/features/auth/application/access";
import { isRole } from "@/features/auth/domain/access";
import type { InviteState } from "@/features/auth/presentation/invite-form";
import { accessDeps, requireActor } from "@/server/auth";
import { config } from "@/server/config";

/** Owner-only mutations. Next.js checks the Origin of server actions; the role is re-read here. */
export async function inviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const actor = await requireActor("manage_access");
  const role = form.get("role");
  const email = form.get("email");
  if (typeof email !== "string" || !isRole(role))
    return { status: "error", message: "Datos inválidos." };
  const result = await inviteMember(accessDeps(), actor, email, role);
  if (!result.ok) {
    const messages = {
      forbidden: "No tienes permiso para invitar.",
      invalid_email: "Escribe un e-mail válido.",
      already_member: "Esa persona ya tiene acceso.",
      is_owner: "Ese e-mail es el del propietario configurado.",
    } as const;
    return { status: "error", message: messages[result.reason] };
  }
  revalidatePath("/panel/accesos");
  return {
    status: "created",
    email: result.invitation.email,
    role: result.invitation.role,
    expiresAt: result.invitation.expiresAt.toISOString(),
    link: `${config().origin}/invitacion/${result.token}`,
  };
}

export async function revokeInvitationAction(form: FormData): Promise<void> {
  const actor = await requireActor("manage_access");
  const id = form.get("id");
  if (typeof id === "string") await revokeInvitation(accessDeps(), actor, id);
  revalidatePath("/panel/accesos");
}

export async function removeMemberAction(form: FormData): Promise<void> {
  const actor = await requireActor("manage_access");
  const id = form.get("id");
  if (typeof id === "string") await removeMember(accessDeps(), actor, id);
  revalidatePath("/panel/accesos");
}
