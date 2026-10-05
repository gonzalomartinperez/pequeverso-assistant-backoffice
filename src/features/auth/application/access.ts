import {
  can,
  INVITATION_TTL_HOURS,
  type InvitationRecord,
  invitationState,
  isInvitationToken,
  normalizeEmail,
  type Role,
  routeSignUp,
} from "../domain/access.ts";
import type { AccessStore, Clock, InvitationConsumer, Member, Secrets } from "./ports.ts";

export type Actor = { id: string; email: string; role: Role };

export type AccessDeps = {
  store: AccessStore;
  secrets: Secrets;
  clock: Clock;
  ownerEmail: string | null;
};

export type AdmissionDeps = Pick<AccessDeps, "secrets" | "clock" | "ownerEmail"> & {
  invitations: InvitationConsumer;
};

export type Admission =
  | { allowed: true; role: Role; via: "owner" | "invitation" }
  | {
      allowed: false;
      reason: "invalid_email" | "email_unverified" | "not_invited" | "invitation_invalid";
    };

/**
 * Called by the auth adapter before an account is created. The invitation (if any) is consumed
 * atomically here, so one invitation admits at most one account.
 */
export async function admitSignUp(
  deps: AdmissionDeps,
  identity: { email: string | null | undefined; emailVerified: boolean },
  invitationToken: string | null,
): Promise<Admission> {
  const token = isInvitationToken(invitationToken) ? invitationToken : null;
  const route = routeSignUp({ ...identity, ownerEmail: deps.ownerEmail }, token !== null);
  if (route.kind === "denied") return { allowed: false, reason: route.reason };
  if (route.kind === "owner") return { allowed: true, role: "owner", via: "owner" };
  const now = deps.clock.now();
  const accepted = await deps.invitations.consumeInvitation(
    deps.secrets.digest(token ?? ""),
    route.email,
    now,
  );
  if (!accepted) return { allowed: false, reason: "invitation_invalid" };
  return { allowed: true, role: accepted.role, via: "invitation" };
}

export type InvitationView =
  | { state: "pending"; email: string; role: Role; expiresAt: Date }
  | { state: "invalid" };

/** Reads an invitation for its landing page without consuming it. Unknown and spent look alike. */
export async function inspectInvitation(deps: AccessDeps, token: string): Promise<InvitationView> {
  if (!isInvitationToken(token)) return { state: "invalid" };
  const invitation = await deps.store.invitationByDigest(deps.secrets.digest(token));
  if (!invitation || invitationState(invitation, deps.clock.now()) !== "pending")
    return { state: "invalid" };
  return {
    state: "pending",
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  };
}

export type InviteResult =
  | { ok: true; token: string; invitation: InvitationRecord }
  | {
      ok: false;
      reason: "forbidden" | "invalid_email" | "already_member" | "is_owner" | "conflict";
    };

export async function inviteMember(
  deps: AccessDeps,
  actor: Actor,
  rawEmail: string,
  role: Role,
): Promise<InviteResult> {
  if (!can(actor.role, "manage_access")) return { ok: false, reason: "forbidden" };
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "invalid_email" };
  if (email === normalizeEmail(deps.ownerEmail)) return { ok: false, reason: "is_owner" };
  if (await deps.store.memberByEmail(email)) return { ok: false, reason: "already_member" };
  const now = deps.clock.now();
  const token = deps.secrets.token();
  const invitation: InvitationRecord = {
    id: deps.secrets.id(),
    email,
    role,
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000),
    acceptedAt: null,
    revokedAt: null,
  };
  const created = await deps.store.createInvitation({
    id: invitation.id,
    email,
    role,
    tokenDigest: deps.secrets.digest(token),
    createdBy: actor.id,
    createdAt: now,
    expiresAt: invitation.expiresAt,
  });
  if (created !== "created") return { ok: false, reason: created };
  return { ok: true, token, invitation };
}

export async function revokeInvitation(
  deps: AccessDeps,
  actor: Actor,
  invitationId: string,
): Promise<boolean> {
  if (!can(actor.role, "manage_access")) return false;
  return deps.store.revokeInvitation(invitationId, actor.id, deps.clock.now());
}

export type RemoveResult =
  | { ok: true; member: Member }
  | { ok: false; reason: "forbidden" | "self" | "configured_owner" | "not_found" };

/** Revocation: deleting the account deletes its sessions, so access ends on the next request. */
export async function removeMember(
  deps: AccessDeps,
  actor: Actor,
  userId: string,
): Promise<RemoveResult> {
  if (!can(actor.role, "manage_access")) return { ok: false, reason: "forbidden" };
  if (userId === actor.id) return { ok: false, reason: "self" };
  const members = await deps.store.listMembers();
  const target = members.find((member) => member.id === userId);
  if (!target) return { ok: false, reason: "not_found" };
  if (target.email === normalizeEmail(deps.ownerEmail))
    return { ok: false, reason: "configured_owner" };
  const removed = await deps.store.removeMember(userId, actor.id, deps.clock.now());
  if (!removed) return { ok: false, reason: "not_found" };
  return { ok: true, member: removed };
}

/** Role of an authenticated account, re-read from storage on every request (no cached role). */
export async function resolveActor(
  deps: AccessDeps,
  session: { userId: string; email: string; emailVerified: boolean } | null,
): Promise<Actor | null> {
  if (!session?.emailVerified) return null;
  const role = await deps.store.memberRole(session.userId);
  return role ? { id: session.userId, email: session.email, role } : null;
}
