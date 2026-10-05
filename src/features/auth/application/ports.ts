import type { InvitationRecord, Role } from "../domain/access.ts";

/** A backoffice account as the access screens show it. Never includes tokens or provider data. */
export type Member = {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  providers: string[];
  activeSessions: number;
};

export type NewInvitation = {
  id: string;
  email: string;
  role: Role;
  tokenDigest: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * Persistence of invitations, members and the access audit. Every mutation re-verifies inside its
 * own transaction that the actor is still an owner (locking the actor's row) and writes its audit
 * entry (actor id, action, subject id, time) in that same transaction.
 */
export interface AccessStore {
  /** Supersedes earlier open invitations for the e-mail. False when the actor is not an owner. */
  createInvitation(invitation: NewInvitation): Promise<boolean>;
  invitationByDigest(digest: string): Promise<InvitationRecord | null>;
  /** Atomically accepts a pending, unexpired invitation for `email`; audited as the system. */
  consumeInvitation(
    digest: string,
    email: string,
    now: Date,
  ): Promise<{ id: string; role: Role } | null>;
  revokeInvitation(id: string, actorId: string, now: Date): Promise<boolean>;
  listInvitations(): Promise<InvitationRecord[]>;
  listMembers(): Promise<Member[]>;
  memberByEmail(email: string): Promise<Member | null>;
  memberRole(userId: string): Promise<Role | null>;
  /** Deletes the account (its sessions and linked identities cascade). Null when not allowed. */
  removeMember(userId: string, actorId: string, now: Date): Promise<Member | null>;
}

export interface Secrets {
  /** 32 random bytes, base64url (43 chars). */
  token(): string;
  digest(token: string): string;
  id(): string;
}

export interface Clock {
  now(): Date;
}
