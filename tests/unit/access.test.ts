import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nodeSecrets } from "../../src/features/auth/adapters/node-secrets.ts";
import {
  type AccessDeps,
  type AdmissionDeps,
  admitSignUp,
  inspectInvitation,
  inviteMember,
  removeMember,
  resolveActor,
  revokeInvitation,
} from "../../src/features/auth/application/access.ts";
import type {
  AccessStore,
  Member,
  NewInvitation,
} from "../../src/features/auth/application/ports.ts";
import {
  can,
  type InvitationRecord,
  invitationState,
  normalizeEmail,
  type Role,
  routeSignUp,
} from "../../src/features/auth/domain/access.ts";

type Audit = { action: string; actorId: string | null; subjectId: string };

/** In-memory AccessStore with the same transactional semantics as the PostgreSQL adapter. */
class MemoryStore implements AccessStore {
  invitations: (InvitationRecord & { digest: string })[] = [];
  members: Member[] = [];
  audits: Audit[] = [];
  private owner(id: string) {
    return this.members.some((m) => m.id === id && m.role === "owner");
  }
  async createInvitation(i: NewInvitation) {
    if (!this.owner(i.createdBy)) return "forbidden" as const;
    for (const open of this.invitations)
      if (open.email === i.email && !open.acceptedAt && !open.revokedAt)
        open.revokedAt = i.createdAt;
    this.invitations.push({ ...i, digest: i.tokenDigest, acceptedAt: null, revokedAt: null });
    this.audits.push({ action: "invitation_created", actorId: i.createdBy, subjectId: i.id });
    return "created" as const;
  }
  async invitationByDigest(digest: string) {
    return this.invitations.find((i) => i.digest === digest) ?? null;
  }
  async consumeInvitation(
    digest: string,
    email: string,
    now: Date,
  ): Promise<{ id: string; role: Role } | null> {
    const i = this.invitations.find((x) => x.digest === digest);
    if (!i || i.email !== email || i.acceptedAt || i.revokedAt || i.expiresAt <= now) return null;
    i.acceptedAt = now;
    this.audits.push({ action: "invitation_accepted", actorId: null, subjectId: i.id });
    return { id: i.id, role: i.role };
  }
  async revokeInvitation(id: string, actorId: string, now: Date) {
    if (!this.owner(actorId)) return false;
    const i = this.invitations.find((x) => x.id === id && !x.acceptedAt && !x.revokedAt);
    if (!i) return false;
    i.revokedAt = now;
    this.audits.push({ action: "invitation_revoked", actorId, subjectId: id });
    return true;
  }
  async listInvitations() {
    return this.invitations;
  }
  async listMembers() {
    return this.members;
  }
  async memberByEmail(email: string) {
    return this.members.find((m) => m.email === email) ?? null;
  }
  async memberRole(id: string) {
    return this.members.find((m) => m.id === id)?.role ?? null;
  }
  async removeMember(id: string, actorId: string) {
    if (!this.owner(actorId)) return null;
    const m = this.members.find((x) => x.id === id) ?? null;
    this.members = this.members.filter((x) => x.id !== id);
    if (m) this.audits.push({ action: "member_removed", actorId, subjectId: id });
    return m;
  }
}

function setup(now = new Date("2026-10-05T12:00:00Z")) {
  const store = new MemoryStore();
  const clock = { now: () => now };
  const deps: AccessDeps & AdmissionDeps = {
    store,
    invitations: store,
    secrets: nodeSecrets,
    clock,
    ownerEmail: "Owner@Example.test",
  };
  const owner = { id: "u-owner", email: "owner@example.test", role: "owner" as const };
  store.members.push({ ...owner, createdAt: now, providers: ["google"], activeSessions: 1 });
  return { store, deps, owner, clock };
}

describe("access domain", () => {
  it("normalizes e-mails without provider-specific folding", () => {
    assert.equal(normalizeEmail("  Ana@Example.COM "), "ana@example.com");
    assert.equal(normalizeEmail("ana+ops@example.com"), "ana+ops@example.com");
    assert.equal(normalizeEmail("not-an-email"), null);
    assert.equal(normalizeEmail("a@b"), null);
  });

  it("grants actions by role only", () => {
    assert.equal(can("owner", "manage_access"), true);
    assert.equal(can("viewer", "manage_access"), false);
    assert.equal(can("viewer", "read_operations"), true);
    assert.equal(can(null, "read_operations"), false);
  });

  it("routes the configured owner, requires verification and an invitation for everyone else", () => {
    const owner = "owner@example.test";
    assert.deepEqual(
      routeSignUp({ email: "OWNER@example.test", emailVerified: true, ownerEmail: owner }, false),
      { kind: "owner" },
    );
    assert.deepEqual(
      routeSignUp({ email: owner, emailVerified: false, ownerEmail: owner }, false),
      {
        kind: "denied",
        reason: "email_unverified",
      },
    );
    // Sharing the owner's domain grants nothing.
    assert.deepEqual(
      routeSignUp({ email: "other@example.test", emailVerified: true, ownerEmail: owner }, false),
      {
        kind: "denied",
        reason: "not_invited",
      },
    );
    assert.deepEqual(
      routeSignUp({ email: "x@example.test", emailVerified: true, ownerEmail: null }, true),
      {
        kind: "invitation",
        email: "x@example.test",
      },
    );
  });

  it("derives invitation state with revocation and acceptance taking precedence over expiry", () => {
    const base: InvitationRecord = {
      id: "i",
      email: "a@b.co",
      role: "viewer",
      createdAt: new Date(0),
      expiresAt: new Date(1000),
      acceptedAt: null,
      revokedAt: null,
    };
    assert.equal(invitationState(base, new Date(500)), "pending");
    assert.equal(invitationState(base, new Date(1000)), "expired");
    assert.equal(
      invitationState({ ...base, acceptedAt: new Date(10) }, new Date(5000)),
      "accepted",
    );
    assert.equal(invitationState({ ...base, revokedAt: new Date(10) }, new Date(5000)), "revoked");
  });
});

describe("access use cases", () => {
  it("bootstraps the configured owner without an invitation", async () => {
    const { deps } = setup();
    assert.deepEqual(
      await admitSignUp(deps, { email: "owner@example.test", emailVerified: true }, null),
      {
        allowed: true,
        role: "owner",
        via: "owner",
      },
    );
  });

  it("rejects an unverified owner e-mail and uninvited identities", async () => {
    const { deps } = setup();
    assert.equal(
      (await admitSignUp(deps, { email: "owner@example.test", emailVerified: false }, null))
        .allowed,
      false,
    );
    assert.deepEqual(
      await admitSignUp(deps, { email: "colleague@example.test", emailVerified: true }, null),
      {
        allowed: false,
        reason: "not_invited",
      },
    );
  });

  it("admits an invited e-mail once, with the invited role, and records the acceptance", async () => {
    const { deps, owner, store } = setup();
    const invite = await inviteMember(deps, owner, "Ana@Example.test", "viewer");
    assert.equal(invite.ok, true);
    if (!invite.ok) return;
    assert.match(invite.token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!store.invitations.some((i) => i.digest === invite.token), "only a digest is stored");
    assert.deepEqual(
      await admitSignUp(deps, { email: "ana@example.test", emailVerified: true }, invite.token),
      {
        allowed: true,
        role: "viewer",
        via: "invitation",
      },
    );
    assert.deepEqual(
      await admitSignUp(deps, { email: "ana@example.test", emailVerified: true }, invite.token),
      {
        allowed: false,
        reason: "invitation_invalid",
      },
    );
    assert.deepEqual(store.audits, [
      { action: "invitation_created", actorId: "u-owner", subjectId: invite.invitation.id },
      { action: "invitation_accepted", actorId: null, subjectId: invite.invitation.id },
    ]);
    // The audit never holds e-mails or tokens.
    assert.ok(!JSON.stringify(store.audits).includes("@"));
  });

  it("refuses an invitation presented by a different e-mail or after expiry or revocation", async () => {
    const { deps, owner, clock } = setup();
    const invite = await inviteMember(deps, owner, "ana@example.test", "owner");
    if (!invite.ok) throw new Error("invite failed");
    assert.equal(
      (await admitSignUp(deps, { email: "eve@example.test", emailVerified: true }, invite.token))
        .allowed,
      false,
    );
    // Still usable by the right person afterwards: a wrong e-mail does not consume it.
    assert.equal((await inspectInvitation(deps, invite.token)).state, "pending");

    const later = {
      ...deps,
      clock: { now: () => new Date(clock.now().getTime() + 49 * 3_600_000) },
    };
    assert.equal(
      (await admitSignUp(later, { email: "ana@example.test", emailVerified: true }, invite.token))
        .allowed,
      false,
    );
    assert.equal((await inspectInvitation(later, invite.token)).state, "invalid");

    const second = await inviteMember(deps, owner, "bob@example.test", "viewer");
    if (!second.ok) throw new Error("invite failed");
    assert.equal(await revokeInvitation(deps, owner, second.invitation.id), true);
    assert.equal(
      (await admitSignUp(deps, { email: "bob@example.test", emailVerified: true }, second.token))
        .allowed,
      false,
    );
  });

  it("a new invitation supersedes the previous open one for the same e-mail", async () => {
    const { deps, owner } = setup();
    const first = await inviteMember(deps, owner, "ana@example.test", "viewer");
    const second = await inviteMember(deps, owner, "ana@example.test", "viewer");
    if (!first.ok || !second.ok) throw new Error("invite failed");
    assert.equal((await inspectInvitation(deps, first.token)).state, "invalid");
    assert.equal((await inspectInvitation(deps, second.token)).state, "pending");
  });

  it("ignores malformed tokens without touching storage", async () => {
    const { deps } = setup();
    assert.equal((await inspectInvitation(deps, "../../etc")).state, "invalid");
    assert.equal(
      (await admitSignUp(deps, { email: "a@example.test", emailVerified: true }, "short")).allowed,
      false,
    );
  });

  it("only owners invite, revoke or remove; viewers are refused", async () => {
    const { deps, store, clock } = setup();
    const viewer = { id: "u-v", email: "v@example.test", role: "viewer" as const };
    store.members.push({
      ...viewer,
      createdAt: clock.now(),
      providers: ["github"],
      activeSessions: 1,
    });
    assert.deepEqual(await inviteMember(deps, viewer, "x@example.test", "viewer"), {
      ok: false,
      reason: "forbidden",
    });
    assert.deepEqual(await removeMember(deps, viewer, "u-owner"), {
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses inviting existing members or the configured owner", async () => {
    const { deps, owner } = setup();
    assert.deepEqual(await inviteMember(deps, owner, "owner@example.test", "viewer"), {
      ok: false,
      reason: "is_owner",
    });
    assert.deepEqual(await inviteMember(deps, owner, "nope", "viewer"), {
      ok: false,
      reason: "invalid_email",
    });
  });

  it("revokes access by removing the account; the configured owner and oneself are protected", async () => {
    const { deps, owner, store, clock } = setup();
    store.members.push({
      id: "u-v",
      email: "v@example.test",
      role: "viewer",
      createdAt: clock.now(),
      providers: [],
      activeSessions: 2,
    });
    store.members.push({
      id: "u-o2",
      email: "owner@example.test",
      role: "owner",
      createdAt: clock.now(),
      providers: [],
      activeSessions: 0,
    });
    assert.deepEqual(await removeMember(deps, owner, owner.id), { ok: false, reason: "self" });
    store.members.push({
      id: "u-other",
      email: "o3@example.test",
      role: "owner",
      createdAt: clock.now(),
      providers: [],
      activeSessions: 0,
    });
    assert.deepEqual(await removeMember(deps, { ...owner, id: "u-other" }, "u-o2"), {
      ok: false,
      reason: "configured_owner",
    });
    const removed = await removeMember(deps, owner, "u-v");
    assert.equal(removed.ok, true);
    assert.equal(
      await resolveActor(deps, { userId: "u-v", email: "v@example.test", emailVerified: true }),
      null,
    );
  });

  it("re-checks the actor's role inside the store: a demoted owner cannot act on a stale role", async () => {
    const { deps, store } = setup();
    store.members[0] = { ...(store.members[0] as Member), role: "viewer" };
    const stale = { id: "u-owner", email: "owner@example.test", role: "owner" as const };
    assert.deepEqual(await inviteMember(deps, stale, "x@example.test", "viewer"), {
      ok: false,
      reason: "forbidden",
    });
    assert.equal(store.invitations.length, 0);
  });

  it("re-reads the role on every request", async () => {
    const { deps, store } = setup();
    const session = { userId: "u-owner", email: "owner@example.test", emailVerified: true };
    assert.equal((await resolveActor(deps, session))?.role, "owner");
    assert.equal(await resolveActor(deps, { ...session, emailVerified: false }), null);
    store.members[0] = { ...(store.members[0] as Member), role: "viewer" };
    assert.equal((await resolveActor(deps, session))?.role, "viewer");
    assert.equal(await resolveActor(deps, null), null);
  });
});
