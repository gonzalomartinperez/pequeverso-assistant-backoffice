# PostgreSQL runtime and recovery worksheet

This is the backoffice's database artifact/recipe for vps-ops to review and translate into its
own infrastructure. Nothing is deployed or published. PostgreSQL stores operator IAM only;
conversation/catalog/spend data remains in the API's SQLite volume. There is no Neo4j service.

## Artifact and security boundary

Build `Dockerfile.postgres` from the reviewed repository commit. Its source is the immutable
`postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382`
for linux/amd64. A fresh upstream pull on 2026-10-10 still resolved to that digest. The derived
artifact installs exact signed Debian security patches for OpenSSL, PCRE2, perl, xz/lzma and
tzdata; upstream 18.4 remains unchanged. Available-fix scans must cover **all** severities,
including UNKNOWN, before using the artifact. Residual advisories remain visible, not accepted
implicitly. Other architectures are untested. Publish/deploy only by a separately authorized
registry manifest digest; a local image id is not that digest.

The official entrypoint is preserved. It calls `gosu` only when starting as uid0; the derived
artifact removes that unused helper and mandates `USER 999:999` (`postgres`). Overriding the
runtime user to root is unsupported. Keep psql, pg_dump, pg_restore, pgbench and the PostgreSQL
server intact. Installer/file removal adds whiteouts to inherited layers: no physical image
size saving is claimed. Security changes do not certify a production environment.

## Storage and isolation

PostgreSQL 18 changes the mount boundary: use a **dedicated persistent parent volume** at
`/var/lib/postgresql`; `PGDATA=/var/lib/postgresql/18/docker`. Mounting only the older
`/var/lib/postgresql/data` path does not persist the default PG18 cluster. See the
[official image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md)
and [Docker persistence guide](https://docs.docker.com/guides/postgresql/immediate-setup-and-data-persistence/).

Provision a new volume owned by uid/gid999 before starting non-root. Change ownership only of
that explicitly identified new volume; never recursively chown a live or another project's
volume. Its cluster directory is mode0700. Keep the parent volume across container removal,
updates and rollback. A PostgreSQL major upgrade is a separate data migration, never an image
swap against an old major's cluster.

Runtime starting proposal (not a capacity guarantee):

| Property | Recipe |
|---|---|
| User/root | 999:999, read-only root, cap-drop ALL, no-new-privileges |
| Data | named project volume `/var/lib/postgresql`, fsync-capable persistent storage |
| Temporary paths | `/tmp` 16 MiB and `/var/run/postgresql` 8 MiB, tmpfs owned999, noexec/nosuid/nodev |
| Shared memory | `/dev/shm` 32 MiB; included in the memory ceiling, not extra reserved RAM |
| Limits | 0.5 CPU, 256 MiB, memory-swap=256 MiB (no extra swap), 128 PIDs |
| Network | dedicated private project data network, port5432 internal only, no published port |
| Logs | Docker local max-size5m/max-file2; no statement/query/credential logging |
| Stop | 20 s grace; assert exit0, no OOM or forced kill in the local drill |
| Probes | internal pg_isready, 5 s interval/3 s timeout, startup grace30 s; readiness of the application is separate |

Do not give database superuser credentials to the running app. Infrastructure creates its
separate database/migration/runtime role policy; this recipe changes no schema or application
role. The synthetic smoke uses an isolated disposable admin solely to initialize/test it.
`POSTGRES_PASSWORD_FILE` is supported by the official entrypoint; store secret files read-only
with permissions allowing uid999 to read them, never in source or receipts. Initial
POSTGRES_* variables only initialize a new cluster, not password rotation on existing data.

## Starting database settings

| Setting | Proposal | Reason / limit |
|---|---|---|
| max_connections | 20 | App pool is5; leave room for migration, backup and monitoring. Do not multiply replicas without budgeting pools |
| shared_buffers | 32MB | Avoid oversized shared memory for this small IAM dataset; Linux page cache also consumes cgroup memory |
| work_mem | 1MB | Per sort/hash operation, possibly per parallel worker; not a total-query or global memory limit |
| maintenance_work_mem | 16MB | Small schema/migration/maintenance starting bound |
| min_wal_size / max_wal_size | 32MB / 128MB | Smaller checkpoint target for small IAM workload; max_wal_size is **soft**, not a disk ceiling |
| fsync / full_page_writes / synchronous_commit | on / on / on | Keep committed IAM writes durable; never disable to improve benchmark numbers |
| log_statement / log_min_error_statement / log_error_verbosity | none / panic / terse | Avoid SQL/values in stdout; retain operational errors and monitor failures without private statement text |

Use command `postgres -c setting=value ...` or a reviewed read-only configuration file under
vps-ops ownership. No WAL/checkpoint compression switch, extension, pooler or new schema is
introduced. Calibrate checkpoints, autovacuum, actual dataset and concurrent OAuth/admin flows
on the intended host. See PostgreSQL's [resource guidance](https://www.postgresql.org/docs/18/runtime-config-resource.html).

## Reproducible local drill

The helper creates its own internal network, two new persistent volumes and disposable
containers, then removes only those resources through its trap. No host ports, production
credentials, model calls or remote actions. Dumps contain synthetic IAM and are deleted after
content-free hashes/counts are recorded. Keep the receipt directory private.

```sh
docker build -f Dockerfile.postgres -t pequeverso-backoffice-postgres:reviewed .
scripts/smoke-postgres.sh EXACT_BACKOFFICE_IMAGE /tmp/pequeverso-pg-receipt pequeverso-backoffice-postgres:reviewed
```

It compares default vs proposed settings on the **same** PostgreSQL artifact and exact app
image: migrates, seeds1000 synthetic operators/sessions/invitations/audit rows, runs8 clients ×
250 IAM-shaped read/write transactions, records settings/memory/data/WAL, dumps/restores to a
fresh database, compares canonical table hashes, runs same-image migration checksum/idempotency checks and
health/readiness, then stops/restarts the persistent cluster and rechecks the data. This is not
real OAuth, a power-loss/fsync validation or sustained shared-host capacity testing. Local
WSL contention and filesystem/cache state can change latency; no production SLA follows.

## Backup, rollback and monitoring

- Take `pg_dump -Fc` before changing an application/schema artifact and at least daily;
  encrypt off-server with bounded private staging. Back up role definitions separately without
  passwords in reports. Retention30 days is a proposal; owner confirms RPO/RTO and storage.
- Recover BETTER_AUTH_SECRET and OAuth provider app configuration from independent encrypted
  secret backup. SQL alone cannot recover encrypted OAuth tokens or provider credentials.
- Restore into a **new isolated database** on the same supported major: pg_restore
  --exit-on-error; compare schema/data hashes and counts; exact-app db:check, migration
  idempotency and readiness; test owner admission, invitations, revocation and audit semantics.
  Verify off-server read/integrity and independent key recovery separately; local restore does
  not prove either. Record backup age and measured RTO.
- Roll back app digest on current additive schema; database/image rollback does not reverse
  migrations or erase later IAM writes. Never restore an older dump automatically as a rollback.
  Preserve the current and last known-good image plus a verified backup.
- Monitor ready duration/restarts/OOM, cgroup current/high-water, connections versus20,
  transaction/lock/error rates, checkpoint/write time, data/WAL bytes and host free space.
  Alert proposals: memory80%, disk free20%, backup older26 h, readiness failure2 min. WAL128MB
  is not a hard cap; monitor actual growth and investigate before storage runs out.
- Budget live cluster + WAL + at least two dump/restore copies + encrypted staging + bounded
  logs + current/rollback images/build cache. Do not sum requests as reservations or assume
  vps-ops' proposed6CPU/8GiB ceiling describes purchased hardware (capacity is currently null).
  Do not purge IAM history, delete the last usable backup or prune unrelated project artifacts.
