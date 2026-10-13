# PostgreSQL runtime and recovery worksheet

This is the backoffice's database artifact/recipe for vps-ops to review and translate into its
own infrastructure. Nothing is deployed or published. PostgreSQL stores operator IAM only;
conversation/catalog/spend data remains in the API's SQLite volume. There is no Neo4j service.

## Artifact and security boundary

Build `Dockerfile.postgres` from the reviewed repository commit. Its source is the immutable
`postgres:18.6-trixie@sha256:885953109528ad3dfc90362b1a6f50a78620b5315be19f187753d267e484dc5b`
for linux/amd64. A fresh official linux/amd64 manifest pull on 2026-10-12 resolved to that digest. The derived
artifact installs exact signed Debian 13 security patches for OpenSSL, PCRE2, perl, xz/lzma and
tzdata. Available-fix scans must cover **all** severities, including UNKNOWN, before using the
artifact. Residual advisories remain visible, not accepted implicitly. Other architectures are
untested. Publish/deploy only by a separately authorized registry manifest digest; a local image
id is not that digest.

The official entrypoint is preserved. It calls `gosu` only when starting as uid0; the derived
artifact removes that unused helper and mandates `USER 999:999` (`postgres`). Overriding the
runtime user to root is unsupported. Keep psql, pg_dump, pg_restore, pgbench and the PostgreSQL
server intact. Unused GPG is purged without autoremove or forced dependency removal. Debian 13
APT 3 uses the retained `sqv` signature verifier, not a required `gpgv` binary. SQLite remains:
Trixie util-linux requires `liblastlog2-2`, which links `libsqlite3-0`; removing it would break
required OS tooling. This is distinct from the historical Bookworm artifact where GPG was
SQLite's only reverse dependency. Runtime GPG/encrypted initialization scripts are unsupported;
encrypt backups outside this artifact under infrastructure ownership. libxml2 and zlib remain
because PostgreSQL core links them. Required XML support retains CVE-2026-6653: Trixie is not an
XML security fix. Unresolved advisories remain visible activation risks, not implicitly accepted.
Installer/file removal adds whiteouts to inherited layers; no physical image saving is inferred.

### OS transition and collation boundary

The same PostgreSQL 18.6 version was smoke-tested separately on immutable Bookworm and Trixie
artifacts. A local **fresh-volume logical** dump/restore of six synthetic UTF8 labels preserved
its content checksum, ordering sample and restart persistence. Both used `en_US.utf8`; the
actual/stored libc collation version changed from 2.36 to 2.41. This sample is not proof for
production indexes, unique constraints or every locale. Never attach the old physical volume
to the new OS artifact automatically. Infrastructure must inspect actual database/index
collations, choose and rehearse a supported logical migration/reindex procedure, preserve
backup/key recovery and verify the real dataset before activation. `ALTER DATABASE ... REFRESH
COLLATION VERSION` alone does not rebuild affected indexes.

## Minor-release compatibility

[PostgreSQL 18.6 release notes](https://www.postgresql.org/docs/release/18.6/)
state that 18.x needs no dump/restore solely for this minor upgrade. Version 18.5 was
never released. The fixes include security hardening of SQL functions, psql and pg_dump;
review logical decoding plugins, pgcrypto cipher recovery and GIN/btree_gist/ltree
indexes before updating an existing cluster. This IAM schema uses none of those extensions,
indexes or replication slots; do not infer this for other databases. PostgreSQL 18 has
[major support until November 14, 2030](https://www.postgresql.org/support/versioning/);
continue applying supported minor/security updates. The PG18 volume boundary and durability
settings remain unchanged. A fresh artifact still requires exact smoke, seeded SQL restore,
persistent restart, signed package review and all-severity vulnerability scan.

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
containers, then removes only those resources through its trap. The reviewed PostgreSQL image argument is mandatory; its vulnerable upstream image is never
an implicit default. Receipts record both immutable image ids and OCI labels/revisions, and
execution uses those ids. No host ports, production
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
  --exit-on-error; compare schema/data hashes and counts; run shipped migration idempotency
  and readiness from the exact app image against the restored database. Run `npm run db:check`
  separately from a clean checkout of that app revision on the isolated PostgreSQL server:
  this development/CI tool is not packaged in the standalone image and creates its own
  throwaway database to detect schema drift. It does not inspect restored IAM rows. Test owner
  admission, invitations, revocation and audit semantics against the actual restored data.
  Verify off-server read/integrity and independent key recovery separately; local restore does
  not prove either. Record backup age and measured RTO.
- Roll back app digest on current additive schema; database/image rollback does not reverse
  migrations or erase later IAM writes. Never restore an older dump automatically as a rollback.
  Preserve the current and last known-good image plus a verified backup.
- Monitor ready duration/restarts/OOM, cgroup current/high-water, connections versus20,
  transaction/lock/error rates, checkpoint/write time, data/WAL bytes and host free space.
  Alert proposals: memory80%, disk free20%, backup older26 h, readiness failure2 min. WAL128MB
  is not a hard cap; monitor actual growth and investigate before storage runs out.
- Budget the live cluster (PGDATA already includes pg_wal; do not add WAL a second time) +
  at least two dump/restore copies + encrypted staging + bounded
  logs + current/rollback images/build cache. Do not sum requests as reservations or assume
  vps-ops' proposed6CPU/8GiB ceiling describes purchased hardware (capacity is currently null).
  Do not purge IAM history, delete the last usable backup or prune unrelated project artifacts.

## Local calibration (2026-10-10)

One frozen-seed comparison of the patched PG18.4 artifact under the same .5CPU/256MiB
ceilings and synthetic IAM workload gave:

| Metric | Default PostgreSQL settings | Proposed settings |
|---|---|---|
| Idle Docker memory | 41.24 MiB | 32.47 MiB |
| cgroup peak after workload | 96,542,720 B | 83,378,176 B |
| Final peak through restore/app-readiness | 126,185,472 B | 113,123,328 B |
| Initialized TCP startup | 12.10 s | 11.67 s |
| Logical restore | 1.24 s | 1.00 s |
| PostgreSQL stop (exit0, OOMfalse) | 1.15 s | .75 s |

Both completed2,000/2,000 transactions with no failures. Restored table hashes matched,
1,000 rows remained in each seeded table, migrations were a no-op after restore, the exact
backoffice image returned health/readiness200, and persisted data matched after restart.
The restored backoffice stopped normally with143/OOMfalse. PostgreSQL data occupied about
50.3MB and WAL16.8MB in this small fixture. Source schema/IAM integration tests also passed
17/17 against the patched proposed runtime. Initial upstream-image and first patched-image
comparisons are historical diagnostics, not the final receipt.

This is a single local WSL sample with shared host contention, not a statistically controlled
performance benchmark. It supports the smaller memory starting recipe while retaining
correctness/durability settings; it does not establish sustained traffic capacity, actual
hardware disk durability, real OAuth or an off-server encrypted restore/key-recovery result.
