# Architecture

One conversation feature, two thin shells. Dependencies point inward; the boundaries below are
enforced by `scripts/check-boundaries.ts` (part of `npm test`).

```
src/
  app/                         route shells (server components): read runtime config, render a shell
    page.tsx                   standalone (secondary)       embed/page.tsx   embedded (primary)
    healthz/route.ts           liveness                     layout.tsx       pre-paint theme, fonts
  proxy.ts                     per-request framing headers (frame-ancestors from EMBED_ALLOWED_ORIGINS)
  features/assistant/
    domain/                    pure: models, conversation reducer, URL policy, rich-text parser
    application/               controller (external store) + ports; no browser APIs beyond AbortSignal
    adapters/                  HTTP transport, SSE reader, runtime validation of API payloads
    presentation/              React components/hooks shared by both shells, standalone shell
    entry.tsx                  composition root: the only module that imports adapters
  features/embed/
    protocol.ts                pure postMessage protocol v1 (types, validators, origin parser)
    use-host-bridge.ts         origin/source-checked bridge to the host window
    embedded-shell.tsx         compact panel header + the shared conversation view
  shared/                      config (server-only runtime config), i18n copy, UI primitives
```

## Data flow

1. The route shell reads `STOREFRONT_ORIGIN`, `ASSISTANT_LINK_HOSTS`, `EMBED_ALLOWED_ORIGINS` on the
   server (per request) and passes plain values to the client shell.
2. `entry.tsx` creates the controller with the HTTP transport (same-origin `/api/v1`).
3. `createAssistant` (application) opens the session once (single-flight), and for each question
   runs one generation: optimistic question → `POST /api/v1/messages` (Idempotency-Key) → validated
   SSE events → reducer events tagged with the turn key.
4. `reduce` (domain) is the only state transition function. Late events from stopped, cleared or
   superseded turns are ignored by key in the reducer and by generation identity in the controller.
5. Presentation reads state with `useSyncExternalStore`. The committed transcript is memoized and
   does not re-render while tokens arrive; only the streaming draft does.

## Conversation rules

- **Streaming**: deltas are provisional; `message.completed` is authoritative and replaces the draft
  in place (same renderer, so no format jump). `run.completed` without an answer, EOF without a
  terminal event, a protocol error after start, or 45 s without bytes (three missed API heartbeats)
  all become an *interrupted* outcome that keeps the partial text.
- **Stop**: with a run id, `POST /runs/{id}/cancel` and wait up to 5 s for `run.cancelled`; before
  the run id is known, abort the request. Deltas after stop are ignored.
- **Retry** is always explicit. After an interruption it reuses the Idempotency-Key, so the API can
  replay a completed answer instead of generating again; if the API answers
  `idempotency_conflict` (the run failed server-side), one retry with a fresh key follows. After a
  failure or cancellation, retry uses a fresh key. The question bubble is not duplicated.
- **Refusals before streaming** (4xx/503 envelopes) return the question to the composer.
  `session_expired` and `csrf_failed` reopen the session; expiry shows a notice.
- **Unavailable** (`assistant_disabled`, `budget_exhausted`, `catalog_unavailable`, from the session
  or a run): new questions are disabled, history stays readable, support is linked.
- **Reopen**: `start()` is idempotent; minimizing/restoring the iframe never reopens the session.
- **History/deletion**: the session restores stored history on load; "Nueva conversación" deletes
  the session (`DELETE /api/v1/session`) and opens a fresh one.

## Security model

- API payloads: strict runtime validation (`adapters/validate.ts`, `adapters/sse.ts`) with size
  bounds; unknown SSE event types or fields are protocol errors.
- URLs: `domain/links.ts` allows product/purchase/image URLs only on the exact storefront origin and
  informational links only there or on allowlisted https hosts. Products failing the policy are
  dropped, not rendered broken.
- Answer text: parsed by `domain/rich-text.ts` into a tiny tree (paragraphs, bold, lists, links) and
  rendered as React elements; there is no HTML rendering path.
- Embedding: see [embed-integration.md](embed-integration.md).

## Adopted from reference repositories (read-only)

See [coordination.md](coordination.md) for revisions and decisions.
