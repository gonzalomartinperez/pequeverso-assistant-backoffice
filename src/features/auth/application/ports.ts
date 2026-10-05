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

export type AuditEntry = {
  action: "invitation_created" | "invitation_revoked" | "invitation_accepted" | "member_removed";
  actorId: string | null;
  targetEmail: string;
  at: Date;
};

/** Persistence of invitations, members and the access audit trail (PostgreSQL adapter). */
export interface AccessStore {
  createInvitation(invitation: NewInvitation): Promise<void>;
  invitationByDigest(digest: string): Promise<InvitationRecord | null>;
  /** Atomically marks a pending, unexpired invitation for `email` as accepted; returns its role. */
  consumeInvitation(digest: string, email: string, now: Date): Promise<Role | null>;
  revokeInvitation(id: string, now: Date): Promise<boolean>;
  listInvitations(): Promise<InvitationRecord[]>;
  listMembers(): Promise<Member[]>;
  memberByEmail(email: string): Promise<Member | null>;
  memberRole(userId: string): Promise<Role | null>;
  /** Deletes the account; its sessions and linked identities go with it. */
  removeMember(userId: string): Promise<Member | null>;
  audit(entry: AuditEntry): Promise<void>;
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
