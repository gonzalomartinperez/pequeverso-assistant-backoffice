# ADR 005 — Backoffice authentication with Better Auth (OAuth only, invitation-gated)

**Status:** accepted (2026-10-05)

**Context.** The repository becomes the private operations backoffice of the assistant. Access
must be limited to an explicitly configured owner and people the owner invites, with Google and
GitHub identities, no passwords, no public sign-up and no access granted by sharing an e-mail
domain. OAuth, session handling and cryptography must not be written from scratch.

**Decision.** Better Auth 1.7.7 (peer support for Next 14–16 and React 18–19, verified on
npm; telemetry off by default and disabled explicitly) with its PostgreSQL adapter:

- Providers: Google and GitHub when both their client id and secret are set; e-mail/password,
  magic links and plugins that add sign-up paths are not enabled. A generic OAuth provider pointing
  at a local fake IdP exists only when `AUTH_TEST_ISSUER` is set, which production refuses.
- Admission in `databaseHooks.user.create.before` via `admitSignUp`
  (`src/features/auth/application/access.ts`): the provider-verified e-mail must equal
  `OWNER_EMAIL`, or a pending invitation for that same e-mail must be presented (HttpOnly cookie
  set by `/invitacion/<token>`) and is consumed atomically. A refused identity gets no user row
  and no session (Better Auth redirects to `/ingresar?error=unable_to_create_user`).
- Account linking: implicit linking disabled; explicit `linkSocial` only, and only to the same
  verified e-mail (`allowDifferentEmails: false`).
- Sessions stored in PostgreSQL, 8 h with 1 h sliding refresh, no cookie cache, so the session,
  the verified e-mail and the role are re-read on every request and deleting an account ends
  access immediately. Explicit linking (`/link-social`) is refused unless the caller is an owner.
- Invitations expire after 48 h. Owner mutations re-check the actor inside their transaction and
  write an id-only audit entry in the same transaction.
- Rate limits stored in PostgreSQL; Better Auth's logger disabled (the app logs redacted events).
  Cookies: HttpOnly, SameSite=Lax, host-only, `Secure` (and `__Secure-` prefix) on https origins.
  Better Auth's Origin/CSRF checks stay on with `trustedOrigins` = the backoffice origin only.
- Roles: `owner` (read + manage access) and `viewer` (read). Stored on the user row
  (`role`, constrained in SQL), enforced server-side in layouts, pages and server actions.

**Alternatives.** Auth.js: maintained, but invitation gating and account-linking rules would
need more custom code around its adapters. Hand-written OAuth: rejected (explicit requirement).
A hosted identity service: an extra third party holding operator identities, not needed for a
handful of accounts.

**Consequences.** One PostgreSQL database is required (ADR 006). Real
Google/GitHub apps (client ids, callback URLs) are created by the owner per environment; they are
not tested here. Upgrades of Better Auth must re-run `npm run db:check` (schema drift) and the
DB-backed suite.

**Provenance.** The 48 h expiry, id-only audit, transactional owner re-check, database rate
limits, disabled library logger, owner-only explicit linking, readiness-gated sign-in, native modal
confirmation and fixture-safety guards were adopted after reviewing the owner's portfolio
backoffice at `portfolio-assistant-backoffice` `f29b6cd` (read-only; see
[coordination.md](../coordination.md)). Pequeverso keeps its own choices where they differ:
committed SQL for Better Auth's tables plus a drift check (instead of applying the library's plan
at deploy time) and browser tests that sign in through a fake OAuth provider (instead of minted
sessions).
