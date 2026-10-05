/**
 * Access policy of the backoffice (pure). Who may hold an account, with which role, and what each
 * role may do. There is no public sign-up and no domain-based access: an identity is admitted only
 * when its provider-verified e-mail equals the configured owner e-mail or matches a pending
 * invitation that was presented together with the sign-in.
 */

export const ROLES = ["owner", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type Action = "read_operations" | "manage_access";

const PERMISSIONS: Record<Role, readonly Action[]> = {
  owner: ["read_operations", "manage_access"],
  viewer: ["read_operations"],
};

export function isRole(value: unknown): value is Role {
  return value === "owner" || value === "viewer";
}

export function can(role: Role | null | undefined, action: Action): boolean {
  return role != null && PERMISSIONS[role].includes(action);
}

const EMAIL =
  /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Canonical form used for comparisons: trimmed and lower-cased. Provider-specific folding (dots,
 * plus addressing) is deliberately not applied: two spellings are two identities.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export const INVITATION_TTL_HOURS = 72;
export const MAX_INVITATION_TTL_HOURS = 24 * 7;

export type InvitationState = "pending" | "accepted" | "revoked" | "expired";

export type InvitationRecord = {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

export function invitationState(invitation: InvitationRecord, now: Date): InvitationState {
  if (invitation.revokedAt) return "revoked";
  if (invitation.acceptedAt) return "accepted";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

export type SignUpInput = {
  email: string | null | undefined;
  emailVerified: boolean;
  ownerEmail: string | null;
};

export type SignUpRoute =
  | { kind: "owner" }
  | { kind: "invitation"; email: string }
  | { kind: "denied"; reason: "invalid_email" | "email_unverified" | "not_invited" };

/**
 * First step of admission, before any invitation is consumed. The caller consumes a matching
 * invitation atomically only for the `invitation` route.
 */
export function routeSignUp(input: SignUpInput, hasInvitationToken: boolean): SignUpRoute {
  const email = normalizeEmail(input.email);
  if (!email) return { kind: "denied", reason: "invalid_email" };
  if (input.emailVerified !== true) return { kind: "denied", reason: "email_unverified" };
  const owner = normalizeEmail(input.ownerEmail);
  if (owner && owner === email) return { kind: "owner" };
  if (!hasInvitationToken) return { kind: "denied", reason: "not_invited" };
  return { kind: "invitation", email };
}

/** Invitation tokens: 32 random bytes, base64url. Only their SHA-256 digest is stored. */
export const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && INVITATION_TOKEN.test(value);
}
