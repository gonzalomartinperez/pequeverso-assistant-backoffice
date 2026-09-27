# Deployment contract (vps-ops handoff)

What this repository provides for the shared VPS managed by `vps-ops` (Coolify + Traefik), and what
it expects from it. **Nothing is deployed.** No image has been published, no DNS record, domain,
route or Coolify resource exists, and `main` holds only the repository bootstrap.

## Artifact

| Item | Value |
|---|---|
| Image | Built from `Dockerfile` at a reviewed `develop` commit; publish to a private registry and deploy **by digest** (`@sha256:…`) only. No image is published yet. |
| Base | `node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6` |
| Architecture | `linux/amd64` (built and run locally; other architectures untested) |
| Process | `node server.js` (Next.js 16.3.6 standalone output), PID 1 under Coolify's `init: true` |
| User | `node` (UID/GID 1000:1000), no capabilities needed |
| Port | `3000/tcp` on `0.0.0.0` (`PORT`, `HOSTNAME`) |
| Filesystem | Read-only root tested; writable: `/tmp` and `/app/.next/cache` (tmpfs, 32 MiB, `uid=1000,gid=1000,mode=0700`) |
| State | **Stateless.** No database, volume, migration or backup. Conversations and sessions live in the API. |
| Secrets | **None.** No build args or runtime variables are secret. |
| Shutdown | SIGTERM; Next.js closes the server. Budget ≤ 20 s (`stop_grace_period`). |
| Resources (proposal) | request 0.1 CPU / 128 MB, limit 1 CPU / 384 MB; measured figures in [verification.md](verification.md). The split with the API within the host's capacity is an ops decision. |

## Runtime variables

| Variable | Required | Production value | Purpose |
|---|---|---|---|
| `EMBED_ALLOWED_ORIGINS` | yes, for embedding | `https://pequeverso.com` | Exact origins allowed to frame `/embed` (`frame-ancestors`) and to talk to it by postMessage. Empty = embedding denied. |
| `STOREFRONT_ORIGIN` | no | `https://pequeverso.com` (default) | Only origin accepted for product, purchase, image and support URLs |
| `ASSISTANT_LINK_HOSTS` | no | `consumer.hotmart.com,refund.hotmart.com` (default) | Extra https hosts allowed for informational links (mirrors the API catalog allowlist) |
| `PORT`, `HOSTNAME`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED` | set by the image | `3000`, `0.0.0.0`, `production`, `1` | Standard |

All variables are read per request, so changing them needs a container restart, not a rebuild.
There are no `NEXT_PUBLIC_*` variables: the browser calls the API same-origin at `/api/v1`.

## Health

- `GET /healthz` → `200 {"status":"ok"}`, `Cache-Control: no-store`. Liveness of the frontend
  process only; it does **not** call the API. Use it for the container healthcheck (the image's
  `HEALTHCHECK` does). The API's own `/health/ready` remains the readiness signal for answering.
- The store must never depend on either endpoint.

## Routing (proposed; needs owner approval of the domain)

Single host `assistant.pequeverso.com` (proposed, **not verified or approved**):

| Match | Service | Notes |
|---|---|---|
| `PathPrefix(/api/)` | pequeverso-assistant-api:8000 | Unchanged path (no prefix stripping); SSE must not be buffered, compressed or retried |
| everything else (`/`, `/embed`, `/healthz`, `/_next/*`, static files) | pequeverso-assistant-web:3000 | |

Same-origin `/api` is what makes the session cookie first-party and removes CORS from the design.
API health endpoints stay internal. The API heartbeats every 15 s during a stream and the client
treats 45 s of silence as a dead stream, so proxy idle/response timeouts must exceed 15 s and
buffering must be off for `/api/`.

## Header ownership

| Header | Owner | Requirement |
|---|---|---|
| `Content-Security-Policy` (incl. `frame-ancestors`) | **Application** | The proxy must not set or override it for the web service. `/embed` needs `frame-ancestors https://pequeverso.com`; other routes send `frame-ancestors 'none'`. |
| `X-Frame-Options` | **Application** | Must be absent on `/embed`; `DENY` elsewhere. |
| `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | Application (proxy may duplicate identical values) | |
| `Strict-Transport-Security` | Proxy / edge | TLS is terminated there. |
| `Cache-Control` | Application for HTML (`/embed`: `private, no-store`); immutable for `/_next/static/*` | Proxy must not cache HTML. |

**Conflict to resolve in vps-ops:** the current proxy label renderer adds a
`Content-Security-Policy: frame-ancestors 'none'` response header to the services it renders. Applied to this web service, it would block the storefront
iframe. The Pequeverso renderer must omit that header for the web service (or, if the proxy must own
it, emit exactly the value above for `/embed`). Never emit both.

## Verification performed here

- Image built from a clean checkout and run with `--read-only --tmpfs /tmp --tmpfs
  /app/.next/cache:uid=1000,gid=1000,mode=0700,size=32m --cap-drop ALL --security-opt
  no-new-privileges`; the full browser suite ran against that container in CI. See
  [verification.md](verification.md) for runs, sizes and memory.
- Tested API contract: the snapshot in `contracts/source.json` (provisional; generated in the API
  agent's uncommitted working tree). **Joint compatibility with a running API is not yet verified.**

## Pending ops / owner decisions

1. Approve the assistant domain and DNS (Cloudflare) — not done.
2. Private registry and publication authorization; first image digest.
3. Pequeverso-specific Traefik renderer with the header ownership above.
4. Final CPU/memory split between web and API.
5. Committed API contract revision to pin before release (replacing the provisional snapshot).
