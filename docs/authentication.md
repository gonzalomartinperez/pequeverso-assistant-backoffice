# Backoffice authentication and access

The repository is public; the application is private. Better Auth 1.7.7 handles OAuth and
PostgreSQL sessions; this repository adds the admission rules, invitations, roles and audit.
Decision record: [ADR 005](adr/005-backoffice-auth-better-auth.md). Storage: [ADR 006](adr/006-iam-in-postgresql.md).

## Configuration

Server-only variables (see `.env.example` and [deployment-contract.md](deployment-contract.md)):
`BACKOFFICE_ORIGIN` (exact https origin; http only on loopback outside production),
`BETTER_AUTH_SECRET` (≥ 32 chars, required except in `test`; also encrypts stored OAuth tokens, so
keep it stable and backed up), `DATABASE_URL`, `OWNER_EMAIL`, and the Google and/or GitHub client id + secret. Production
fails closed when any is missing or weak (`src/server/parse-config.ts`). Register the callbacks
`<origin>/api/auth/callback/google` and `<origin>/api/auth/callback/github` in owner-managed OAuth
apps, separate for development and production.

## Who gets in

| Identity | Result |
|---|---|
| Provider-verified e-mail equal to `OWNER_EMAIL` | Account created as `owner` |
| Provider-verified e-mail with a pending invitation **presented in the same sign-in** | Account created with the invited role; the invitation is consumed atomically |
| Same domain as the owner, no invitation | Refused; no user row, no session |
| Unverified e-mail (even the owner's) | Refused |
| Existing account | Signs in again; role re-read from the database on every request |
| New identity for an existing e-mail (another provider or account) | Refused: implicit linking is off. Owners can link explicitly from "Cuenta" (same verified e-mail only); viewers cannot (refused server-side on `/link-social`) |

There is no password login, magic link or public registration. The first arbitrary user never
becomes owner. Changing `OWNER_EMAIL` is an access-policy change that needs review.

## Invitations

Owners create invitations in `/panel/accesos` for one e-mail and a role (`viewer` or `owner`).
The link is shown once; it is a bearer secret, so deliver it privately. Only the SHA-256 digest
of its 32-byte token is stored. It expires after 48 hours, works once, can be revoked, and a new
invitation for the same e-mail supersedes the previous one. The landing route
(`/invitacion/<token>`) checks it without consuming it, moves the token into a 15-minute HttpOnly
cookie for the OAuth round trip and redirects (303, `no-store`, `no-referrer`), so the token leaves
the address bar. Proxy access logs must redact `/invitacion/*` paths and OAuth callback queries.

## Sessions, revocation, roles

- Sessions live in PostgreSQL (8 h, refreshed hourly), cookie cache disabled, so every protected
  request re-reads the session, requires a verified e-mail and re-reads the role.
- Cookies: HttpOnly, SameSite=Lax, host-only (no cross-subdomain cookies), `Secure` with the
  `__Secure-` prefix on https. Nothing auth-related is stored in `localStorage`.
- Removing an account (owners only, never yourself or the configured owner) deletes it with its
  sessions and linked identities in one transaction; access ends on the next request. Re-entry
  needs a new invitation.
- `owner`: read operations and manage access. `viewer`: read operations. Every owner mutation
  re-checks, inside its own transaction and with the actor's row locked, that the actor is still
  an owner.
- Audit (`backoffice_access_audit`): action, actor id, subject id (invitation or user id), time.
  No e-mails, tokens or provider data.
- CSRF: Better Auth checks `Origin` against the single trusted origin on cookie-bearing requests
  and validates callback URLs; server actions are Origin-checked by Next.js.
- Rate limits: Better Auth's limiter (sign-in 3 per 10 s per IP, others 30 per minute) with
  counters in PostgreSQL, so they survive restarts. The client IP comes from `X-Forwarded-For` only
  through the proxies in `TRUSTED_PROXY_IPS`; without it a startup warning is logged.
- Admission runs inside Better Auth's own sign-up transaction: the invitation is consumed with one
  guarded `UPDATE` on that transaction's adapter (the invitation and audit tables are registered as
  Better Auth models), so a failed sign-up never spends it and no second pool connection is taken
  (no pool exhaustion under concurrent first sign-ups). Concurrent invitations for one e-mail end
  with exactly one open invitation; a losing request gets a friendly retry message.
- Disabled endpoints: user update/delete, e-mail change, account listing, provider access/refresh
  tokens and account info. Linking and unlinking are owner-only.

## Availability

`/healthz` is liveness only. `/readyz` (internal) answers 200 only when configuration parses,
PostgreSQL answers and every migrated table exists. When not ready, `/ingresar` shows a calm
"acceso no disponible" message with providers disabled, protected pages redirect there, and no raw
database, configuration or OAuth error is rendered. Better Auth's own logger is disabled; the app
logs redacted events only (`sign_up_denied` with a reason, `access_check_failed`,
`database_connection_lost`).

## Migrations

`node scripts/db-migrate.ts` (same image, one-shot, before the release) applies the committed SQL
in `migrations/` with an advisory lock and checksums; never at server start. The SQL for Better
Auth's tables is compiled from its official `better-auth/db/migration` API for this exact
configuration and committed for review; `npm run db:check` fails if the two ever differ.

## Tests and their limits

- `npm run test:db`: schema drift + 17 integration tests through the real Better Auth OAuth
  callback against a loopback fake identity provider (`scripts/fake-idp.ts`) and a real
  PostgreSQL: owner admission, verified e-mail, one-use invitation bound to its e-mail, OAuth state
  rejection, no implicit linking, owner-only explicit linking, revocation, foreign Origin and
  callback refusal, database rate limiting, id-only audit, no password endpoints, invitation not
  spent when the sign-up transaction rolls back, 8 concurrent first sign-ups on a 5-connection
  pool, viewer refused on every linking endpoint, concurrent invitations for one e-mail.
- `npm run test:backoffice`: the same flows in Chromium, Firefox and WebKit against the production
  build, signing in through the fake provider (no session minting or bypass).
- Test-only switches (`AUTH_TEST_ISSUER`, `AUTH_DISABLE_RATE_LIMIT`) are refused in production and
  outside a loopback origin and a loopback database named `*test*`/`*fixture*`; scripts that create
  databases refuse non-loopback servers without echoing the URL (`tests/unit/fixture-safety.test.ts`).

Not proven here: real Google and GitHub apps, `__Secure-` cookies over TLS behind the proxy,
deployment. Verify both providers, an invitation, linking, revocation and CSRF over TLS before
release.
