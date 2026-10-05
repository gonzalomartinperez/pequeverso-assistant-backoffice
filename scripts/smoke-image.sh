#!/usr/bin/env bash
# Smoke test of the exact backoffice image, hardened as in production (read-only root, no
# capabilities, non-root): it must refuse to start unconfigured, apply its migrations as a
# one-shot command, report ready only with its database, and send the private-page headers.
# Synthetic configuration only (fake OAuth client ids, disposable PostgreSQL); no real secrets.
#   scripts/smoke-image.sh [image]
set -euo pipefail

IMAGE="${1:-pequeverso-assistant-web:rc}"
NET="pv-bo-smoke-$$"
DB="pv-bo-smoke-db-$$"
APP="pv-bo-smoke-app-$$"
PORT="${SMOKE_PORT:-18090}"
PW="smoke-only-$(openssl rand -hex 8)"
cleanup() {
  docker rm -f "$APP" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
hardened=(--read-only --tmpfs /tmp --tmpfs /app/.next/cache:uid=1000,gid=1000,mode=0700,size=32m
  --cap-drop ALL --security-opt no-new-privileges)

docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_USER=backoffice -e POSTGRES_PASSWORD="$PW" \
  -e POSTGRES_DB=backoffice --tmpfs /var/lib/postgresql \
  postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382 >/dev/null
for _ in $(seq 1 30); do docker exec "$DB" pg_isready -U backoffice -d backoffice >/dev/null 2>&1 && break; sleep 1; done

URL="postgres://backoffice:$PW@$DB:5432/backoffice"
config=(-e BACKOFFICE_ORIGIN=https://backoffice.smoke.invalid -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  -e DATABASE_URL="$URL" -e OWNER_EMAIL=owner@smoke.invalid -e GITHUB_CLIENT_ID=smoke
  -e GITHUB_CLIENT_SECRET=smoke -e TRUSTED_PROXY_IPS=127.0.0.1)

# 1. Unconfigured production start fails closed.
if docker run --rm "${hardened[@]}" --network "$NET" "$IMAGE" timeout 20 node server.js >/tmp/pv-bo-unconf.log 2>&1; then
  echo "unconfigured image started" >&2; exit 1
fi
grep -q configuration_invalid /tmp/pv-bo-unconf.log || { echo "no configuration_invalid log" >&2; exit 1; }
! grep -q "$PW" /tmp/pv-bo-unconf.log

# 2. Migrations as a one-shot container; a second run applies nothing.
docker run --rm "${hardened[@]}" --network "$NET" -e DATABASE_URL="$URL" "$IMAGE" node scripts/db-migrate.ts
docker run --rm "${hardened[@]}" --network "$NET" -e DATABASE_URL="$URL" "$IMAGE" node scripts/db-migrate.ts

# 3. Configured start: non-root, healthy, ready, private headers.
docker run -d --name "$APP" "${hardened[@]}" --network "$NET" -p "127.0.0.1:$PORT:3000" "${config[@]}" "$IMAGE" >/dev/null
test "$(docker exec "$APP" id -u)" != 0
for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/readyz" | grep -q '"ready"'
headers="$(curl -sS -o /dev/null -D - "http://127.0.0.1:$PORT/ingresar")"
grep -qi '^content-security-policy:.*frame-ancestors .none.' <<<"$headers"
grep -qi '^cache-control:.*no-store' <<<"$headers"
grep -qi '^x-robots-tag:.*noindex' <<<"$headers"
code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/panel")"
[[ "$code" =~ ^30[37]$ ]] || { echo "unauthenticated /panel answered $code" >&2; exit 1; }
! docker logs "$APP" 2>&1 | grep -q "$PW"

# 4. Without its database the app is not ready (and says nothing more).
docker stop "$DB" >/dev/null
code="$(curl -sS -o /tmp/pv-bo-ready.json -w '%{http_code}' "http://127.0.0.1:$PORT/readyz")"
test "$code" = 503 && grep -q '"not_ready"' /tmp/pv-bo-ready.json
mem="$(docker stats --no-stream --format '{{.MemUsage}}' "$APP")"
echo "image smoke passed: fail-closed, migrations idempotent, non-root read-only, ready/not-ready, private headers; idle $mem"
