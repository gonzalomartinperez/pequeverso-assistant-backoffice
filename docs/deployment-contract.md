# Deployment contract (vps-ops handoff)

What this repository provides for the shared VPS managed by `vps-ops` (Coolify + Traefik), and what
it needs from it. **Nothing is deployed.** No image is published, and no DNS record, domain,
route, database or Coolify resource exists for the backoffice.

## Artifact

| Item | Value |
|---|---|
| Image | Built from `Dockerfile` at a reviewed `develop` commit; publish to a private registry and deploy **by digest** only. Not published yet. |
| Base | `node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`, `linux/amd64` (built and run locally; other architectures untested) |
| Commands | default `node server.js` (Next.js 16.3.6 standalone); one-shot `node scripts/db-migrate.ts` (migrations) |
| User | `node` (UID/GID 1000:1000), no capabilities |
| Port | `3000/tcp` on `0.0.0.0` (`PORT`, `HOSTNAME`) |
| Filesystem | Read-only root tested; writable tmpfs `/tmp` and `/app/.next/cache` (`uid=1000,gid=1000,mode=0700,size=32m`) |
| State | None in the container. Identity and access live in PostgreSQL (below). |
| Shutdown | SIGTERM ends the process (no long-lived streams); a 20 s stop grace period is ample |
| Resources | Measured locally: ~64 MiB right after start (read-only, production config). Proposal: request 0.1 CPU / 128 MB, limit 1 CPU / 384 MB; confirm under real use |
| Size | ~97 MB uncompressed (local build, 2026-10-05) |

## PostgreSQL (required)

- A dedicated database and role for the backoffice on a private network; never exposed publicly,
  never shared with portfolio services. Tested with PostgreSQL 17.6 and 18.4.
- Migrations: run `node scripts/db-migrate.ts` with `DATABASE_URL` as a one-shot container of the
  **same image digest** before starting it. Idempotent, advisory-locked, checksum-verified,
  append-only (additive), so the previous image keeps working after a migration.
- Rollback: redeploy the previous digest; migrations are not reversed. Restore from backup only for
  data loss (separate decision).
- Backups: daily logical dump (`pg_dump -Fc`), encrypted, off-server; restore drill before
  activation. Retention proposal: 30 days. RPO/RTO to be confirmed by the owner.
- Data classification: operator identities (e-mail, name), encrypted OAuth tokens, sessions with
  IP/user agent, rate-limit counters, invitations (e-mail, role, token digest), access audit (ids
  only). No buyer or conversation data.
- Pool: at most 5 connections per container, 5 s connect timeout, 5 s statement timeout.

## Runtime variables

| Variable | Secret | Required | Purpose |
|---|---|---|---|
| `BACKOFFICE_ENVIRONMENT` | no | yes (`production`) | Enables fail-closed checks |
| `BACKOFFICE_ORIGIN` | no | yes | Exact https origin of the backoffice (trusted origin, OAuth callbacks, invitation links) |
| `BETTER_AUTH_SECRET` | **yes** | yes | ≥ 32 random characters; rotating it signs everyone out |
| `DATABASE_URL` | **yes** | yes | Backoffice PostgreSQL |
| `OWNER_EMAIL` | no | yes | The only identity admitted without invitation |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secret: yes | at least one provider | Google OAuth app (owner-created) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | secret: yes | at least one provider | GitHub OAuth app (owner-created) |
| `OPS_API_URL` | no | for the dashboard | API base URL on the **internal** network (e.g. `http://pequeverso-assistant-api:8000`) |
| `OPS_READ_TOKEN` | **yes** | with `OPS_API_URL` | Same value as the API's `OPS_READ_TOKEN` (≥ 32 chars) |
| `AUTH_TEST_ISSUER`, `AUTH_DISABLE_RATE_LIMIT` | — | never | Test only; production refuses them |

No `NEXT_PUBLIC_*` variables exist; all values are read on the server at runtime (restart, not
rebuild, to change them). Secret names proposed for vps-ops: `pequeverso-backoffice-auth-secret`,
`pequeverso-backoffice-database-url`, `pequeverso-backoffice-google-oauth`,
`pequeverso-backoffice-github-oauth`, `pequeverso-assistant-ops-read-token` (shared with the API).

## Health

- `GET /healthz` → `200 {"status":"ok"}`, `no-store`: process liveness only.
- `GET /readyz` → `200 {"status":"ready"}` only when configuration parses, PostgreSQL answers and
  every migrated table exists; otherwise `503 {"status":"not_ready"}` without details. Internal
  only (do not route publicly). Use it as the readiness check.
- If the database drops, the pool reconnects on the next query; meanwhile protected pages redirect
  to a safe "unavailable" sign-in page. The dashboard reports "no disponible" if the API is
  unreachable.

## Routing (proposal, pending owner approval)

A **separate host** from the public assistant API (example only: `backoffice.assistant.pequeverso.com`;
not approved, no DNS). Reasons: host-only cookies of the backoffice and of the API never share an
origin, the API's `/api/` prefix does not collide with Better Auth's `/api/auth/*`, and the private
app can be restricted at the edge independently.

| Match | Service |
|---|---|
| everything on the backoffice host | backoffice:3000 |
| (internal only) `http://pequeverso-assistant-api:8000/internal/v1/ops/summary` | reached by the backoffice over the private network; **never routed publicly** |

OAuth callback URLs to register (per environment): `<BACKOFFICE_ORIGIN>/api/auth/callback/google`
and `<BACKOFFICE_ORIGIN>/api/auth/callback/github`.

## Header ownership

The application sets `Content-Security-Policy` (nonce-based, per request), `X-Frame-Options`,
`Cache-Control: private, no-store` and `X-Robots-Tag` on backoffice routes; the proxy must not
override or cache them. `Strict-Transport-Security` belongs to the proxy/edge.

## Smoke test for an authorized deployment

1. `node scripts/db-migrate.ts` → `Migrations: N applied` (or none pending).
2. `GET /healthz` → 200 and `GET /readyz` → 200. `GET /panel` without a session → 307 to `/ingresar`.
3. `GET /ingresar` → CSP with a nonce, `frame-ancestors 'none'`, `no-store`.
4. Owner signs in with the real provider → `/panel` shows the API reading (not synthetic).
5. A non-invited account is refused; the ops endpoint is unreachable from outside the network.

## Verification performed here

Image built and run with `--read-only --tmpfs … --cap-drop ALL --security-opt no-new-privileges`
as uid 1000: migrations applied, health and headers checked. Browser suite against the production
build with real PostgreSQL and a fake IdP: [verification.md](verification.md#backoffice).
Not verified: real Google/GitHub OAuth, TLS/cookie prefixes through the proxy, the real API ops
endpoint over the private network.

## Legacy chat shells

Until their removal the image still serves `/` and `/embed`; they are no longer the public chat
(the storefront hosts the native assistant). Do not route them publicly.
