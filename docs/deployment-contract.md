# Deployment contract (vps-ops handoff)

What this repository provides for the shared VPS managed by `vps-ops` (Coolify + Traefik), and what
it needs from it. **Nothing is deployed.** No image is published, and no DNS record, domain,
route, database or Coolify resource exists for the backoffice.

## Artifact

| Item | Value |
|---|---|
| Image | Built from `Dockerfile` at a reviewed `develop` commit; publish to a private registry and deploy **by digest** only. Not published yet. |
| Base | `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`, `linux/amd64` (built and run locally; other architectures untested) |
| Commands | default `node server.js` (Next.js 16.3.8 standalone); one-shot `node scripts/db-migrate.ts` (migrations) |
| User | `node` (UID/GID 1000:1000), no capabilities |
| Port | `3000/tcp` on `0.0.0.0` (`PORT`, `HOSTNAME`) |
| Filesystem | Read-only root tested; writable tmpfs `/tmp` and `/app/.next/cache` (`uid=1000,gid=1000,mode=0700,size=32m`) |
| State | None in the container. Identity and access live in PostgreSQL (below). |
| Shutdown | Next handles SIGTERM by closing HTTP/Next and exiting 143; use a 20 s stop grace period. Smoke verifies idle stop without SIGKILL/OOM; in-flight authenticated transaction drainage remains untested |
| Resources | Local bounded synthetic fixture: idle 58.3 MiB, cgroup high-water 104.8 MiB including database loss. Proposal: request 0.1 CPU / 128 MiB, limit 1 CPU / 384 MiB; real-provider and authenticated load remain untested |
| Size | Docker 29 inspect `Size`: 98,914,468 bytes; CLI image listing: 417 MB. Baseline fields were 96,552,397 bytes / 405 MB. No image/disk size reduction is claimed; global installers are absent from the live filesystem but inherited layers remain |

The immutable official base keeps Node 24.21.0. Its refreshed Debian PCRE2 package is
`10.42-1+deb12u2`; runtime installs the available signed Debian security package
`perl-base=5.36.0-7+deb12u4`. Global npm, npx, Corepack and Yarn are removed from runtime;
application dependencies remain the traced `/app/node_modules`, and migrations use Node/pg.
Build-stage installers remain isolated from the final artifact. OS advisories without an
available fix stay visible in exact-image scan evidence; this change does not imply acceptance
or make the production environment ready.

## PostgreSQL (required)

Use the [PostgreSQL runtime and recovery worksheet](postgresql-runtime.md) for the separately
built database artifact, PostgreSQL18 volume boundary, measured bounded recipe and isolated
restore drill. Infrastructure remains owned by vps-ops; this is not a deployment authorization.

- A dedicated database and role for the backoffice on a private network; never exposed publicly,
  never shared with portfolio services. Tested with PostgreSQL 17.6 and 18.4.
- Store PostgreSQL data on a dedicated persistent volume, never the disposable tmpfs used by
  `scripts/smoke-image.sh`. Volume and backup lifecycle belong to vps-ops; container removal must
  preserve data. Leave at least 20% disk headroom for WAL, migrations and dump/restore working space.
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
- Recover `BETTER_AUTH_SECRET` and OAuth provider configuration from an independent encrypted
  secret backup. The SQL dump alone cannot recover encrypted OAuth credentials or provider app
  settings; test secret-key recovery separately without logging keys.
- A restore drill must use a new isolated database: restore the encrypted off-server dump, run
  `db:check` and readiness from the same release digest, then verify owner admission, invitations,
  revoked sessions and audit rows. Record backup age, restore time and checksum. A successful
  disposable schema migration is not a backup/restore proof.
- Pool: at most 5 connections per container, 5 s connect timeout, 5 s statement timeout.

## Runtime variables

| Variable | Secret | Required | Purpose |
|---|---|---|---|
| `BACKOFFICE_ENVIRONMENT` | no | set to `production` by the image | Fail-closed checks; also implied by `NODE_ENV=production`, which refuses `development` |
| `BACKOFFICE_ORIGIN` | no | yes | Exact https origin of the backoffice (trusted origin, OAuth callbacks, invitation links) |
| `BETTER_AUTH_SECRET` | **yes** | yes | ≥ 32 random characters; rotating it signs everyone out |
| `DATABASE_URL` | **yes** | yes | Backoffice PostgreSQL |
| `OWNER_EMAIL` | no | yes | The only identity admitted without invitation |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secret: yes | at least one provider | Google OAuth app (owner-created) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | secret: yes | at least one provider | GitHub OAuth app (owner-created) |
| `OPS_API_URL` | no | for the dashboard | API base URL on the **internal** network. https, or plain http only to a single-label Docker service name (e.g. `http://pequeverso-assistant-api:8000`) or a host in `OPS_API_INSECURE_INTERNAL_HOSTS`: the bearer token then travels only on the private Docker network, which must not be shared with untrusted services |
| `OPS_API_INSECURE_INTERNAL_HOSTS` | no | no | Extra internal host names allowed over http |
| `TRUSTED_PROXY_IPS` | no | yes in production | Exact address(es)/narrow CIDR of the Traefik container(s) that forward requests; Better Auth then reads the client IP from `X-Forwarded-For` for per-IP sign-in limits. Empty: forwarded chains are ignored (a startup warning is logged) and limits may group clients. vps-ops must supply the proxy's stable address on the backoffice network |
| `OPS_READ_TOKEN` | **yes** | with `OPS_API_URL` | Same value as the API's `OPS_READ_TOKEN` (≥ 32 chars) |
| `AUTH_TEST_ISSUER`, `AUTH_DISABLE_RATE_LIMIT` | — | never | Test only; production refuses them |

The server validates this configuration at startup (`src/instrumentation.ts`) and exits with a
redacted `configuration_invalid` log when a production requirement is missing. No `NEXT_PUBLIC_*` variables exist; all values are read on the server at runtime (restart, not
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

## Bounded monitoring and shared-host budgets

- The image liveness probe aborts its HTTP request after 2 s; Docker enforces a separate 5 s
  process timeout, 30 s interval and 3 retries after a 20 s startup grace. Liveness does not
  establish database, API or storefront availability. Readiness uses the existing 5 s database
  connect/statement bounds. Keep readiness internal; do not send bearer credentials to probes.
- Smoke tests set app ceilings of 1 CPU, 384 MiB and 128 PIDs, plus 32 MiB each for `/tmp` and
  `.next/cache`; the disposable PostgreSQL has 0.5 CPU, 256 MiB and 128 PIDs. `--memory-swap` equals
  each memory limit, allowing no additional swap. These fixture
  ceilings are proposed starting points, not a real-traffic capacity guarantee. PostgreSQL's
  persistent volume and budgets must be sized separately after the restore drill.
- Use Docker's `local` log driver with `max-size=5m,max-file=2` (about 10 MiB per container plus
  driver overhead). Keep application logs redacted; do not retain session cookies, OAuth tokens,
  invitation links or ops bearer tokens. Central log retention must have an explicit size/age
  limit. Log rotation does not limit volumes or image/cache growth.
- Monitor container restart count, unhealthy/readiness duration, RSS/limit, sampled CPU and
  OOMKilled, plus host disk free space, PostgreSQL data/WAL growth and age of the last verified
  backup. Suggested alerts: readiness failure beyond 2 minutes, repeated restarts/OOM, memory
  above 80% of its limit, disk free below 20%, or backup older than 26 hours. Calibrate against
  actual service traffic and shared-host memory; do not sum requests as a guaranteed reservation.
- Retain the running digest and previous known-good rollback digest. Registry/image retention
  and build-cache expiry need a finite disk budget; prune only identified unused artifacts after
  rollback/backup checks. Do not run blanket Docker prune on a shared VPS.
- Local image/fixture measurements and OS/package scanning limitations are release evidence.
  Real OAuth, production data and shared-VPS load remain activation gates; no remote monitoring,
  Docker settings or VPS resource was changed here.

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
override or cache them. The application also sends `Strict-Transport-Security: max-age=31536000` on backoffice routes when
`BACKOFFICE_ORIGIN` is https; the proxy/edge must send HSTS on every response of the host (same or
stronger value) because TLS terminates there.

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
