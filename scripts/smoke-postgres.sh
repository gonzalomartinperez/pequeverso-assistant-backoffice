#!/usr/bin/env bash
# Isolated synthetic IAM benchmark/restore, never production and never paid model calls.
set -euo pipefail
image=${1:?Usage: scripts/smoke-postgres.sh exact-backoffice-image [receipt-directory] [postgres-image]}
receipt=${2:-/tmp/pequeverso-pg-smoke-$(date +%s)}
pg_image=${3:-postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382}
prefix=pv-pg-smoke-$$
mkdir -p "$receipt"
chmod 700 "$receipt"
network=$prefix-net
containers=()
volumes=()
cleanup() {
  for container in "${containers[@]}"; do docker rm -f "$container" >/dev/null 2>&1 || true; done
  for volume in "${volumes[@]}"; do docker volume rm "$volume" >/dev/null 2>&1 || true; done
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create --internal "$network" >/dev/null
monotonic() { cut -d' ' -f1 /proc/uptime; }
elapsed() { awk -v start="$1" -v end="$(monotonic)" 'BEGIN {printf "%.3f", end-start}'; }
wait_ready() {
  local container=$1
  for _ in $(seq 1 100); do
    if docker exec "$container" pg_isready -h 127.0.0.1 -U synthetic -d backoffice >/dev/null 2>&1; then return; fi
    sleep .1
  done
  echo 'PostgreSQL readiness timeout' >&2
  return 1
}
for mode in default bounded; do
  container=$prefix-$mode
  volume=$container-data
  containers+=("$container")
  volumes+=("$volume")
  docker volume create "$volume" >/dev/null
  # New disposable volume only: the long-running server itself is uid999, no capabilities.
  docker run --rm --read-only --network none --user 0:0 --cap-drop ALL --cap-add CHOWN \
    --mount "type=volume,src=$volume,dst=/var/lib/postgresql" --entrypoint chown \
    "$pg_image" 999:999 /var/lib/postgresql
  settings=()
  if [[ $mode == bounded ]]; then
    settings=(-c max_connections=20 -c shared_buffers=32MB -c work_mem=1MB \
      -c maintenance_work_mem=16MB -c min_wal_size=32MB -c max_wal_size=128MB)
  fi
  started=$(monotonic)
  docker run -d --name "$container" --network "$network" --user 999:999 --read-only \
    --cap-drop ALL --security-opt no-new-privileges --memory 256m --memory-swap 256m \
    --cpus .5 --pids-limit 128 --shm-size 32m \
    --log-driver local --log-opt max-size=5m --log-opt max-file=2 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,uid=999,gid=999,mode=0700 \
    --tmpfs /var/run/postgresql:rw,noexec,nosuid,nodev,size=8m,uid=999,gid=999,mode=0700 \
    --mount "type=volume,src=$volume,dst=/var/lib/postgresql" \
    -e POSTGRES_USER=synthetic -e POSTGRES_PASSWORD=disposable-local-only \
    -e POSTGRES_DB=backoffice "$pg_image" postgres \
    -c fsync=on -c full_page_writes=on -c synchronous_commit=on \
    -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse "${settings[@]}" >/dev/null
  wait_ready "$container"
  [[ $(docker exec "$container" id -u) == 999 ]]
  [[ $(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$container") == true ]]
  [[ $(docker exec "$container" printenv PGDATA) == /var/lib/postgresql/18/docker ]]
  printf 'startup_seconds=%s\n' "$(elapsed "$started")" > "$receipt/$mode-metrics.txt"
  docker run --rm --network "$network" --read-only --cap-drop ALL \
    --security-opt no-new-privileges \
    -e "DATABASE_URL=postgres://synthetic:disposable-local-only@$container:5432/backoffice" \
    "$image" node scripts/db-migrate.ts > "$receipt/$mode-migrations.txt"
  docker exec "$container" psql -X -U synthetic -d backoffice -Atc \
    "SELECT name||'='||setting FROM pg_settings WHERE name IN ('shared_buffers','work_mem','maintenance_work_mem','max_connections','fsync','full_page_writes','synchronous_commit','min_wal_size','max_wal_size') ORDER BY name" \
    > "$receipt/$mode-settings.txt"
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U synthetic -d backoffice >/dev/null <<'SQL'
INSERT INTO auth_user (id,name,email,"emailVerified",role,"createdAt","updatedAt")
SELECT 'synthetic-'||i,'Synthetic operator','operator-'||i||'@example.invalid',true,CASE WHEN i=1 THEN 'owner' ELSE 'viewer' END,'2026-10-10','2026-10-10' FROM generate_series(1,1000) i;
INSERT INTO auth_session (id,"expiresAt",token,"updatedAt","userId","createdAt")
SELECT 'synthetic-session-'||i,'2027-01-01','disposable-session-'||i,'2026-10-10','synthetic-'||i,'2026-10-10' FROM generate_series(1,1000) i;
INSERT INTO backoffice_invitation (id,email,role,token_digest,created_by,created_at,expires_at)
SELECT 'synthetic-invite-'||i,'invite-'||i||'@example.invalid','viewer',md5(i::text)||md5(i::text),'synthetic-1','2026-10-10','2027-01-01' FROM generate_series(1,1000) i;
INSERT INTO backoffice_access_audit (id,action,actor_id,subject_id,at)
SELECT 'synthetic-audit-'||i,'invitation_created','synthetic-1','synthetic-invite-'||i,'2026-10-10' FROM generate_series(1,1000) i;
SQL
  docker stats --no-stream --format 'idle_memory={{.MemUsage}} idle_cpu={{.CPUPerc}} pids={{.PIDs}}' "$container" >> "$receipt/$mode-metrics.txt"
  # Content-free fixture query/write shape; not a real OAuth or a sustained capacity test.
  docker exec -i "$container" sh -c 'cat > /tmp/iam-load.sql' <<'SQL'
\set operator random(1,1000)
BEGIN;
SELECT role FROM auth_user WHERE id='synthetic-'||:operator::text;
SELECT count(*) FROM auth_session WHERE "userId"='synthetic-'||:operator::text;
UPDATE auth_session SET "updatedAt"="updatedAt"+interval '1 microsecond' WHERE id='synthetic-session-'||:operator::text;
SELECT count(*) FROM backoffice_invitation WHERE accepted_at IS NULL AND revoked_at IS NULL;
COMMIT;
SQL
  docker exec "$container" pgbench -U synthetic -d backoffice -n -c 8 -j 2 -t 250 --random-seed=20261010 \
    -f /tmp/iam-load.sql > "$receipt/$mode-load.txt"
  docker exec "$container" sh -c 'printf "peak_memory_bytes="; cat /sys/fs/cgroup/memory.peak; printf "data_bytes="; du -sb "$PGDATA" | cut -f1; printf "wal_bytes="; du -sb "$PGDATA/pg_wal" | cut -f1' >> "$receipt/$mode-metrics.txt"
  hash_sql='SELECT md5(string_agg(row_to_json(t)::text,E'"'"'\n'"'"' ORDER BY id)) FROM auth_user t; SELECT md5(string_agg(row_to_json(t)::text,E'"'"'\n'"'"' ORDER BY id)) FROM auth_session t; SELECT md5(string_agg(row_to_json(t)::text,E'"'"'\n'"'"' ORDER BY id)) FROM backoffice_invitation t; SELECT md5(string_agg(row_to_json(t)::text,E'"'"'\n'"'"' ORDER BY id)) FROM backoffice_access_audit t; SELECT count(*) FROM backoffice_schema_migrations;'
  docker exec "$container" psql -X -U synthetic -d backoffice -Atc "$hash_sql" > "$receipt/$mode-before-hashes.txt"
  docker exec "$container" pg_dump -U synthetic -d backoffice -Fc > "$receipt/$mode.dump"
  sha256sum "$receipt/$mode.dump" > "$receipt/$mode-dump.sha256"
  docker exec "$container" createdb -U synthetic restored
  restored=$(monotonic)
  docker exec -i "$container" pg_restore -U synthetic -d restored --exit-on-error < "$receipt/$mode.dump"
  printf 'restore_seconds=%s\n' "$(elapsed "$restored")" >> "$receipt/$mode-metrics.txt"
  docker exec "$container" psql -X -U synthetic -d restored -Atc "$hash_sql" > "$receipt/$mode-after-hashes.txt"
  cmp "$receipt/$mode-before-hashes.txt" "$receipt/$mode-after-hashes.txt"
  docker run --rm --network "$network" --read-only --cap-drop ALL \
    --security-opt no-new-privileges \
    -e "DATABASE_URL=postgres://synthetic:disposable-local-only@$container:5432/restored" \
    "$image" node scripts/db-migrate.ts > "$receipt/$mode-restored-migrations.txt"
  app=$container-restored-app
  containers+=("$app")
  app_config=(-e BACKOFFICE_ORIGIN=https://postgres.smoke.invalid
    -e BETTER_AUTH_SECRET=disposable-postgres-smoke-secret-not-production
    -e "DATABASE_URL=postgres://synthetic:disposable-local-only@$container:5432/restored"
    -e OWNER_EMAIL=owner@example.invalid -e GITHUB_CLIENT_ID=synthetic
    -e GITHUB_CLIENT_SECRET=synthetic -e TRUSTED_PROXY_IPS=127.0.0.1)
  docker run -d --name "$app" --network "$network" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --memory 384m --memory-swap 384m --cpus 1 --pids-limit 128 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000,mode=0700 \
    --tmpfs /app/.next/cache:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000,mode=0700 \
    --log-driver local --log-opt max-size=5m --log-opt max-file=2 \
    "${app_config[@]}" "$image" >/dev/null
  for _ in $(seq 1 60); do
    if docker exec "$app" node -e "fetch('http://localhost:3000/readyz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
    sleep .2
  done
  docker exec "$app" node -e "Promise.all(['healthz','readyz'].map(async p=>{const r=await fetch('http://localhost:3000/'+p,{signal:AbortSignal.timeout(2000)});if(r.status!==200)process.exitCode=1;console.log(p+'='+r.status)}))" > "$receipt/$mode-restored-ready.txt"
  app_stopped=$(monotonic)
  docker stop --time 20 "$app" >/dev/null
  printf 'restored_app_stop_seconds=%s\n' "$(elapsed "$app_stopped")" >> "$receipt/$mode-metrics.txt"
  app_exit=$(docker inspect --format '{{.State.ExitCode}}/{{.State.OOMKilled}}' "$app")
  [[ $app_exit == 0/false || $app_exit == 143/false ]]
  printf 'restored_app_exit=%s\n' "$app_exit" >> "$receipt/$mode-metrics.txt"
  docker rm "$app" >/dev/null
  docker exec "$container" sh -c 'printf "final_before_stop_peak_bytes="; cat /sys/fs/cgroup/memory.peak' >> "$receipt/$mode-metrics.txt"
  stopped=$(monotonic)
  docker stop --time 20 "$container" >/dev/null
  stop_elapsed=$(elapsed "$stopped")
  printf 'stop_seconds=%s\n' "$stop_elapsed" >> "$receipt/$mode-metrics.txt"
  awk -v duration="$stop_elapsed" 'BEGIN {exit !(duration>=0 && duration<=20)}'
  docker inspect --format 'exit_code={{.State.ExitCode}} oom_killed={{.State.OOMKilled}}' "$container" >> "$receipt/$mode-metrics.txt"
  [[ $(docker inspect --format '{{.State.ExitCode}}/{{.State.OOMKilled}}' "$container") == 0/false ]]
  docker start "$container" >/dev/null
  wait_ready "$container"
  docker exec "$container" psql -X -U synthetic -d restored -Atc "$hash_sql" > "$receipt/$mode-restart-hashes.txt"
  cmp "$receipt/$mode-before-hashes.txt" "$receipt/$mode-restart-hashes.txt"
  docker exec "$container" psql -X -U synthetic -d restored -Atc 'SELECT count(*) FROM auth_user; SELECT count(*) FROM auth_session; SELECT count(*) FROM backoffice_invitation; SELECT count(*) FROM backoffice_access_audit;' > "$receipt/$mode-counts.txt"
  # Dumps contain only local synthetic IAM data; hashes/counts are sufficient shared evidence.
  rm "$receipt/$mode.dump"
done
printf 'backoffice_image=%s\npostgres_image=%s\nreceipt=%s\n' "$image" "$pg_image" "$receipt"
