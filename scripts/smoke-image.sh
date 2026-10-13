#!/usr/bin/env bash
# Smoke test of the exact backoffice image, hardened as in production (read-only root, no
# capabilities, non-root): it must refuse to start unconfigured, apply its migrations as a
# one-shot command, report ready only with its database, and send the private-page headers.
# Synthetic configuration only (fake OAuth client ids, disposable PostgreSQL); no real secrets.
#   scripts/smoke-image.sh [image]
set -euo pipefail

IMAGE="${1:-pequeverso-assistant-backoffice:rc}"
NET="pv-bo-smoke-$$"
DB="pv-bo-smoke-db-$$"
APP="pv-bo-smoke-app-$$"
PORT="${SMOKE_PORT:-18090}"
RUNTIME_UID="${SMOKE_UID:-65532}"
case "$RUNTIME_UID" in 65532|1000) ;; *) echo "unsupported fixture UID" >&2; exit 2 ;; esac
LOG_DIR="$(mktemp -d)"
PW="smoke-only-$(openssl rand -hex 8)"
cleanup() {
  docker rm -f "$APP" "$DB" "$APP-unconfigured" "$APP-proxy" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT
# Linux monotonic uptime avoids NTP/WSL wall-clock adjustments in duration measurements.
monotonic_ms() { awk '{printf "%.0f", $1 * 1000}' /proc/uptime; }
hardened=(--read-only --memory 384m --memory-swap 384m --cpus 1 --pids-limit 128
  --log-driver local --log-opt max-size=5m --log-opt max-file=2
  --tmpfs /tmp:rw,nosuid,nodev,size=32m,mode=1777 --tmpfs /app/.next/cache:uid=$RUNTIME_UID,gid=$RUNTIME_UID,mode=0700,size=32m
  --cap-drop ALL --security-opt no-new-privileges)

docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_USER=backoffice -e POSTGRES_PASSWORD="$PW" \
  -e POSTGRES_DB=backoffice --memory 256m --memory-swap 256m --cpus 0.5 --pids-limit 128 \
  --log-driver local --log-opt max-size=5m --log-opt max-file=2 --tmpfs /var/lib/postgresql \
  postgres:18.6-trixie@sha256:885953109528ad3dfc90362b1a6f50a78620b5315be19f187753d267e484dc5b >/dev/null
for _ in $(seq 1 30); do docker exec "$DB" pg_isready -U backoffice -d backoffice >/dev/null 2>&1 && break; sleep 1; done

URL="postgres://backoffice:$PW@$DB:5432/backoffice"
config=(-e BACKOFFICE_ORIGIN=https://backoffice.smoke.invalid -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  -e DATABASE_URL="$URL" -e OWNER_EMAIL=owner@smoke.invalid -e GITHUB_CLIENT_ID=smoke
  -e GITHUB_CLIENT_SECRET=smoke -e TRUSTED_PROXY_IPS=127.0.0.1)

# 1. Unconfigured production start fails closed.
if timeout 20 docker run --name "$APP-unconfigured" --rm "${hardened[@]}" --network "$NET" "$IMAGE" node server.js >"$LOG_DIR/unconfigured.log" 2>&1; then
  echo "unconfigured image started" >&2; exit 1
fi
grep -q configuration_invalid "$LOG_DIR/unconfigured.log" || { echo "no configuration_invalid log" >&2; exit 1; }
! grep -q "$PW" "$LOG_DIR/unconfigured.log"

# A fully configured production start also rejects malformed trusted-proxy addresses.
if timeout 20 docker run --name "$APP-proxy" --rm "${hardened[@]}" --network "$NET" "${config[@]}" \
  -e TRUSTED_PROXY_IPS=::::/32 "$IMAGE" node server.js >"$LOG_DIR/proxy.log" 2>&1; then
  echo "malformed trusted proxy configuration started" >&2; exit 1
fi
grep -q configuration_invalid "$LOG_DIR/proxy.log" || { echo "no proxy configuration_invalid log" >&2; exit 1; }
! grep -q "$PW" "$LOG_DIR/proxy.log"
! grep -q '::::' "$LOG_DIR/proxy.log"

# 2. Migrations as a one-shot container; a second run applies nothing.
docker run --rm "${hardened[@]}" --network "$NET" -e DATABASE_URL="$URL" "$IMAGE" node scripts/db-migrate.ts
docker run --rm "${hardened[@]}" --network "$NET" -e DATABASE_URL="$URL" "$IMAGE" node scripts/db-migrate.ts

# 3. Configured start: non-root, healthy, ready, private headers.
started_at="$(monotonic_ms)"
docker run -d --name "$APP" "${hardened[@]}" --network "$NET" -p "127.0.0.1:$PORT:3000" "${config[@]}" "$IMAGE" >/dev/null
test "$(docker exec "$APP" node -p 'process.getuid()')" = "$RUNTIME_UID"
for _ in $(seq 1 40); do curl --max-time 3 -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl --max-time 3 -fsS "http://127.0.0.1:$PORT/readyz" | grep -q '"ready"'
echo "startup_ms=$(( $(monotonic_ms) - started_at ))"
headers="$(curl --max-time 6 -sS -o /dev/null -D - "http://127.0.0.1:$PORT/ingresar")"
grep -qi '^content-security-policy:.*frame-ancestors .none.' <<<"$headers"
grep -qi '^cache-control:.*no-store' <<<"$headers"
grep -qi '^x-robots-tag:.*noindex' <<<"$headers"
code="$(curl --max-time 6 -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/panel")"
[[ "$code" =~ ^30[37]$ ]] || { echo "unauthenticated /panel answered $code" >&2; exit 1; }
! docker logs "$APP" 2>&1 | grep -q "$PW"
# Observability stays inaccessible when not explicitly configured.
code="$(curl --max-time 6 -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/internal/v1/ops/metrics")"
test "$code" = 404

# Bounded synthetic HTTP load, not authenticated-user or real-provider capacity.
echo "before_load_stats=$(docker stats --no-stream --format '{{.MemUsage}} CPU={{.CPUPerc}} PIDs={{.PIDs}}' "$APP")"
for _ in $(seq 1 8); do
  jobs=()
  for route in healthz readyz ingresar panel; do
    curl --max-time 6 -fsS "http://127.0.0.1:$PORT/$route" >/dev/null &
    jobs+=("$!")
  done
  for request_pid in "${jobs[@]}"; do wait "$request_pid"; done
done
peak="$(docker exec "$APP" node -e "try{process.stdout.write(require('node:fs').readFileSync('/sys/fs/cgroup/memory.peak','utf8').trim())}catch{process.stdout.write('unavailable')}")"
echo "synthetic_http_requests=32 concurrency=4 cgroup_memory_peak_bytes=$peak"

# 4. Without its database the app is not ready (and says nothing more).
docker stop "$DB" >/dev/null
code="$(curl --max-time 6 -sS -o "$LOG_DIR/ready.json" -w '%{http_code}' "http://127.0.0.1:$PORT/readyz")"
test "$code" = 503 && grep -q '"not_ready"' "$LOG_DIR/ready.json"
mem="$(docker stats --no-stream --format '{{.MemUsage}}' "$APP")"
echo "cgroup_memory_peak_after_db_loss_bytes=$(docker exec "$APP" node -e "try{process.stdout.write(require('node:fs').readFileSync('/sys/fs/cgroup/memory.peak','utf8').trim())}catch{process.stdout.write('unavailable')}")"
stopped_at="$(monotonic_ms)"
docker stop --time 20 "$APP" >/dev/null
echo "shutdown_ms=$(( $(monotonic_ms) - stopped_at ))"
test "$(docker inspect --format '{{.State.OOMKilled}}' "$APP")" = false
exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$APP")"
echo "shutdown_exit_code=$exit_code"
# Node may report 143 for an ordinary SIGTERM; 137 would mean forced SIGKILL.
[[ "$exit_code" = 0 || "$exit_code" = 143 ]]
echo "image smoke passed: fail-closed, migrations idempotent, non-root read-only, ready/not-ready, private headers; post-load memory $mem"
