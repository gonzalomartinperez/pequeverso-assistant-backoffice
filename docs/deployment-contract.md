# Deployment contract (vps-ops handoff)

What this repository provides for the shared VPS managed by `vps-ops` (Coolify + Traefik), and what
it needs from it. **Nothing is deployed or published by this project.** Local fixture images
and databases are test artifacts; production resources, DNS, routes and Coolify provisioning
remain outside this repository's authority.

## Artifact

| Item | Value |
|---|---|
| Image | Built from `Dockerfile` at a reviewed `develop` commit; publish to a private registry and deploy **by digest** only. Not published yet. |
| Base | Builder `node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315`; runtime `gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b`, `linux/amd64` (base interpreters probed locally; application-image verification required; other architectures untested) |
| Commands | default `node server.js` (Next.js16.4.2 standalone); one-shot `node scripts/db-migrate.ts` (migrations) |
| User | `65532:65532` (distroless nonroot), no capabilities |
| Port | `3000/tcp` on `0.0.0.0` (`PORT`, `HOSTNAME`) |
| Filesystem | Read-only root tested; writable tmpfs `/tmp` and `/app/.next/cache` (`uid=65532,gid=65532,mode=0700,size=32m`) |
| State | None in the container. Identity and access live in PostgreSQL (below). |
| Shutdown | Next handles SIGTERM by closing HTTP/Next and exiting 143; use a 20 s stop grace period. Smoke verifies idle stop without SIGKILL/OOM; in-flight authenticated transaction drainage remains untested |
| Resources | Local bounded synthetic fixture: idle 58.3 MiB, cgroup high-water 104.8 MiB including database loss. Proposal: request 0.1 CPU / 128 MiB, limit 1 CPU / 384 MiB; real-provider and authenticated load remain untested |
| Size | Historical2026-10-10 final image inspect `Size`: 98,914,506 bytes; CLI image listing: 417 MB. Baseline fields were 96,552,397 bytes / 405 MB. No image/disk size reduction is claimed; global installers are absent from the live filesystem but inherited layers remain |

Current runtime uses the shared maintained distroless Debian13 Node24 artifact, with no
shell or global installer. Historical slim-image security-package/removal and size samples
above remain historical; removal by whiteout was not physical layer optimization. Current
local candidate inspect content bytes are71,170,167 versus98,462,725 for the rebuilt slim
baseline. This is a mixed dependency/runtime comparison, not proof of lower RAM or faster
requests. The same Node version, migration, readiness/failure, headers and stop checks passed
on both exact local fixtures. Production/containerd/registry size measures are distinct.

## PostgreSQL (required)

Use the [PostgreSQL runtime and recovery worksheet](postgresql-runtime.md) for historical
application-owned artifact tests, PostgreSQL18 persistence, bounded recipes and isolated restore
drills. The owner-selected production topology target is one project engine and two logical databases below. Infrastructure remains owned by vps-ops; this is not a deployment authorization.

- A dedicated database and role for the backoffice on a private network; never exposed publicly,
  never shared with portfolio services. Historical tests covered17.6/18.4; current artifact uses supported PostgreSQL 18.6. Runtime app credentials must not be superuser; infrastructure owns dedicated migration/runtime grants.
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
  shipped migration checksum/idempotency and readiness from the same exact image digest, then verify owner admission, invitations,
  revoked sessions and audit rows. Record backup age, restore time and checksum. A successful
  disposable schema migration is not a backup/restore proof. Run `npm run db:check` separately
  from a source clean checkout against an isolated test PostgreSQL with CREATEDB: it is not
  packaged in the image, creates its own database for drift and does not validate restored rows.
- Pool: at most 5 connections per container, 5 s connect timeout, 5 s statement timeout.

### One project engine, separate IAM database and credentials

Use the API-owned PostgreSQL18/pgvector artifact as the single Pequeverso engine, with two
separate databases: API state/knowledge and backoffice IAM. Do not start a second BO database
controller or share an engine with Portfolio. vps-ops owns the service lifecycle, persistent
volume, HBA/private network CIDRs, backup storage, capacity and secret inventory. This
repository owns IAM migrations and its table grants. Follow the API
[project bootstrap](https://github.com/gonzalomartinperez/pequeverso-assistant-api/blob/develop/docs/knowledge-operations.md#one-project-engine-two-database-bootstrap)
and [operator handoff](https://github.com/gonzalomartinperez/pequeverso-assistant-api/blob/develop/docs/handoffs/vps-ops.md).

Operator-owned example names below are not credentials or executable application migrations.
Provision distinct login secrets privately; never put passwords in SQL, CLI arguments or logs.
Neither IAM identity may be superuser, create roles/databases, replicate or bypass RLS. The
migration owner is separate from the runtime identity and owns only IAM relations:

```sql
-- Operator session: substitute reviewed project-specific names before running.
CREATE ROLE pv_iam_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE pv_iam_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE DATABASE pv_iam OWNER pv_iam_owner;
REVOKE ALL ON DATABASE pv_iam FROM PUBLIC;
GRANT CONNECT ON DATABASE pv_iam TO pv_iam_owner, pv_iam_runtime;
-- Operator retains explicit owner/admin access; PUBLIC TEMPORARY and CREATE are revoked too.
-- Apply the same PUBLIC revoke on the API and unused system databases in API bootstrap.
-- Grant no API capability membership, ownership or CONNECT to either IAM identity.
```

Run `node scripts/db-migrate.ts` from the exact image with the private IAM **owner** DSN.
After migration, connect to IAM as its owner and apply the explicit runtime grants below;
review them again whenever a new migration adds tables. Do not grant all tables or default
privileges broadly, and never give runtime owner membership:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pv_iam_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_user, public.auth_session,
  public.auth_account, public.auth_verification, public.auth_rate_limit,
  public.backoffice_invitation TO pv_iam_runtime;
GRANT SELECT, INSERT ON public.backoffice_access_audit TO pv_iam_runtime;
REVOKE ALL ON public.backoffice_schema_migrations FROM pv_iam_runtime;
REVOKE UPDATE, DELETE ON public.backoffice_access_audit FROM pv_iam_runtime;
```

`DATABASE_URL` on the long-running backoffice uses only the IAM runtime DSN. Keep the owner
DSN in the one-shot migration job; it is not a fallback for runtime failures. Confirm actual
cross-database LOGIN rejection and ownership/privileges after provisioning, rather than
assuming network isolation or default PUBLIC grants suffice. HBA restrictions complement
SQL grants and must be selected by vps-ops for its actual private network.

The initial isolated local one-engine drill passed API31 database tests, BO18 database tests and
BO51 browser tests (three optional live-ops skips). Six real LOGINs were denied access to the
other application's database, eight forbidden SQL operations were rejected and five
least-privilege identities read authorized synthetic rows. Both independent restores into
fresh target databases matched complete row hashes. The full suites used privileged fixture
operator connections; separate role probes do **not** establish a full browser run under
production runtime credentials. A leftover owned browser-test database required explicit
cleanup and is recorded separately. Dumps omit cluster roles/HBA/secrets: restore their
private operator inventory separately. This is local logical isolation and recovery evidence,
not production HBA, off-server secret recovery, capacity or VPS deployment approval.

The browser harness now separates its fixture bootstrap and runtime identities. Its disposable
loopback operator needs CREATEDB/CREATEROLE for test provisioning; only the parent retains that
credential. Next, mock operations and the fake identity provider receive no bootstrap database
variables. Next receives only a fresh NOSUPERUSER, non-owner IAM runtime identity with the
explicit grants above. Real PostgreSQL regression checks cover allowed DML and denied TEMP,
DDL, migration history, audit mutation and cross-database connections. The initial administrative
browser run remains historical evidence, not a runtime-role run.

Fixture teardown uses SIGTERM with a five-second infrastructure grace period; children must
close before the database and role are dropped and their absence verified. This does not
change test/expect deadlines, workers or generation retries. A forced teardown or a missing
cleanup confirmation is not a successful resource-cleanup proof. These fixture procedures do
not provision a production owner, runtime secret, HBA rule or shared engine.

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

## Optional operational observability

See [observability](observability.md) for the full server-only variables and privacy/bounds.
`OPS_TELEMETRY_ENABLED=false` preserves legacy summary-only operation. Private telemetry1.0
is independent from unchanged summary1.2 and the public chat contract. `OBSERVABILITY_METRICS_ENABLED=false`
keeps `/internal/v1/ops/metrics` absent; enabling it requires a new, distinct
`OBSERVABILITY_READ_TOKEN`, never the API-client token. `OBSERVABILITY_TRACES_ENABLED=false`
starts no exporter; enabling requires a reviewed private
`OBSERVABILITY_OTLP_TRACES_ENDPOINT` and no nonempty ambient `OTEL_*` settings. These switches
require a restart, never a client build. Metric/collector credentials remain server-only.
No observability switch changes OAuth admission, roles or assistant activation.

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
| backoffice host except `/internal/*`, `/healthz`, `/readyz` | backoffice:3000; protected pages require Better Auth |
| `/internal/*`, `/healthz`, `/readyz` | never publish through the public proxy; private probes/scrape only |
| (internal only) `http://pequeverso-assistant-api:8000/internal/v1/ops/summary` | reached by the backoffice over the private network; **never routed publicly** |
| (internal only) API `/internal/v1/ops/telemetry` | optional authenticated server read, same API bearer |
| (internal only) BO `/internal/v1/ops/metrics` | private Prometheus scrape, separate BO machine bearer |

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

The historical resource/size sample above predates the availability/observability addition.
Each new candidate needs its own exact-image measurements, smoke, scan and CI receipts;
do not attribute the old sample to a rebuilt artifact.

Image built and run with `--read-only --tmpfs … --cap-drop ALL --security-opt no-new-privileges`
as UID65532 for the current candidate (UID1000 was historical): migrations applied, health and headers checked. Browser suite against the production
build with real PostgreSQL and a fake IdP: [verification.md](verification.md#backoffice).
Not verified: real Google/GitHub OAuth, TLS/cookie prefixes through the proxy, the real API ops
endpoint over the private network.

## Shared runtime baseline

See [runtime-baseline.md](runtime-baseline.md) for the2026-10-13 shared cohort and image
acceptance. Actual committed locks and Dockerfiles supersede historical version/size samples;
no production publication, deployment or live OAuth/provider check is implied.
