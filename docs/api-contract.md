# API contract

The frontend consumes pequeverso-assistant-api v1 (`contract_version` "1", `schema_version` "1").

## Pinned snapshot

| | |
|---|---|
| Files | `contracts/api/openapi.json`, `contracts/api/sse.schema.json`, `contracts/api/examples/*`, `contracts/api/manifest.json` (copied verbatim) |
| Source | API `develop` **`dc4e4c6`** (committed); contract v1 introduced in `0750524` and unchanged since, per the API's `docs/handoffs/assistant-web.md` |
| Snapshot | manifest SHA-256 `d163b6d7…2b97a` (full value in `contracts/source.json`), byte-identical to the provisional working-tree snapshot taken earlier the same day |
| Status | **Committed** |
| Check | `npm run contract:check` verifies every artifact against the pinned manifest |

Unit tests parse **every** example stream the API publishes and the example session through the real
adapters (`tests/unit/transport.test.ts`). The mock API (`scripts/mock-api.ts`) reproduces the same
shapes for browser tests and is labelled as a mock.

## Endpoints used

| Method | Path | Use |
|---|---|---|
| `POST` | `/api/v1/session` | Open (restore or create) the cookie session; returns `csrf_token`, `messages`, `availability`, `limits` |
| `DELETE` | `/api/v1/session` | Delete the conversation ("Nueva conversación"), `X-CSRF-Token` |
| `POST` | `/api/v1/messages` | Ask; `Idempotency-Key`, `X-CSRF-Token`, body `{content, page}`; SSE response |
| `POST` | `/api/v1/runs/{run_id}/cancel` | Stop, `X-CSRF-Token`, 202 |

Answer `content` is rendered as text with bold and `- `/numbered lists only — never as HTML and
never auto-linked (API handoff); actionable links come only from `links`, `sources` and `products`.
Notices: only `contact_data_redacted` gets extra UI (`payment_data_refused` is explained in the
answer text, `answer_replaced` needs none). Retry after an interruption first reuses the
Idempotency-Key — the API replays a completed run for the same key and payload — and falls back to
a new key on `idempotency_conflict`; after failures or cancellations it always uses a new key.

`GET /api/v1/availability` exists but is not needed: availability arrives with the session and with
refusals. SSE events: `run.started` (stored question or `null` on replay), `message.delta`,
`message.completed` (authoritative message), then exactly one terminal `run.completed` /
`run.failed {code, retryable}` / `run.cancelled`. `id:` lines and `: keep-alive` comments are
tolerated. Errors: `{"error": {code, message, retryable, request_id}}`; the UI localizes from `code`.

## Refreshing the snapshot

1. Inspect the API repository's **committed** `contracts/` at a reviewed revision (read-only).
2. Copy `openapi.json`, `sse.schema.json`, `manifest.json` and `examples/` into `contracts/api/`.
3. Update `contracts/source.json` (commit, manifest SHA-256, date, `status`).
4. Run `npm run check` and `npm run test:browser`; update validators, mock and docs for any change.
