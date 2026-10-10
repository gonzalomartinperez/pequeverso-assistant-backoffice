# ADR 006 — Backoffice identity and access in a private PostgreSQL

**Status:** accepted (2026-10-05); provisioning belongs to vps-ops

**Context.** Better Auth needs a database for users, linked identities, sessions and OAuth state;
the backoffice adds invitations and an access audit trail. This data must stay separate from the
public assistant (anonymous buyer sessions live in the API's SQLite) and must be backed up.

**Decision.** A dedicated PostgreSQL database (tested on 17.6 and 18.4) on the VPS private
network, owned by this application. Schema lives in committed, append-only SQL migrations
(`migrations/`), applied by `node scripts/db-migrate.ts` under an advisory lock with per-file
checksums, as a one-shot command of the same image, before the release that needs them.
`npm run db:check` proves the committed SQL equals what Better Auth expects for this
configuration and that re-applying is a no-op.

**Consequences.** vps-ops provisions the database, credentials (`DATABASE_URL`), private network,
backups and restore drills. Data held: operator e-mails and names from the providers, encrypted
OAuth tokens, sessions (with IP and user agent recorded by Better Auth for rate limiting and
session listing), invitations (e-mail, role, token digest) and the access audit (action, actor id,
target e-mail, time). No buyer data and no conversation content. Rolling back an image does not
roll back the schema; migrations are additive so the previous image keeps working.
