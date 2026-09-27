# Embed integration (storefront handoff)

How the Pequeverso storefront will host the assistant. **Status: not integrated.** Everything
below is verified only against this repository's local cross-origin harness
(`tests/fixtures/host/`, run with `npm run preview:fixture`). The storefront repository has not
been changed, and no production origin, DNS record or proxy route exists yet.

## Responsibilities

| Storefront (host) owns | This application (`/embed`) owns |
|---|---|
| Floating launcher button, its badge and position | Messages, composer, send/stop/retry |
| Outer panel: size, position, open/minimize/expand/restore | Product cards, comparison, resources, sources, links, follow-ups |
| Creating the iframe on **first open** and keeping that same element afterwards | Loading, streaming, interruption, unavailable and offline states |
| Focus hand-off to/from the frame, Escape handling on the host side | Focus inside the frame, Escape inside the frame (requests minimize) |
| Theme and page context it sends | Session with the API (cookie + in-memory CSRF token) |
| Keeping the store fully usable if the assistant fails or is removed | Honest failure states; never blocking the host page |

The assistant is advisory and read-only. Purchase buttons link to the storefront's own purchase
section (`purchase_url`, e.g. `/grafismo-fonetico/#comprar`), where the existing Hotmart checkout
lives. The assistant never collects payment data, creates orders or mutates a cart.

## Iframe

```html
<iframe
  title="Asistente de compras Pequeverso"
  src="https://assistant.pequeverso.com/embed?theme=light&page=product"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  allow=""
  referrerpolicy="strict-origin-when-cross-origin"></iframe>
```

- `assistant.pequeverso.com` is the **proposed** origin (pending domain approval and DNS; see
  [deployment-contract.md](deployment-contract.md)). Local harness: `http://localhost:3207`.
- Query parameters are presentation hints only: `theme=light|dark`, `page=home|product|support`.
  Never put tokens, e-mail addresses or conversation text in the URL.
- Sandbox: `allow-scripts` (the app), `allow-same-origin` (its own first-party session cookie and
  storage — without it every request would be anonymous), `allow-forms` (composer form),
  `allow-popups` + `allow-popups-to-escape-sandbox` (product, support and source links open in a new
  tab as normal pages). **Not** granted: `allow-top-navigation*` (model output can never navigate
  the store), `allow-modals`, `allow-downloads`. `allow=""` grants no device features; the
  assistant does not need the Fullscreen API — expanding is a host-side size change.
- Create the iframe on the first launcher click, then **keep the same element**: hide the panel
  with `hidden` + `inert` when minimized. Removing or re-parenting the iframe reloads it (the
  session restores history, but an in-flight answer is lost).

## Panel sizes (as tested in the harness)

| Mode | Size | Notes |
|---|---|---|
| Compact desktop | `min(400px, 100vw − 48px)` × `min(680px, 100dvh − 48px)`, bottom-right, 24 px gap | Default |
| Expanded desktop | `min(760px, 100vw − 48px)` × `100dvh − 48px` | Only when `canExpand: true` |
| Mobile (≤ 639 px) | full width × `visualViewport.height`, top at `visualViewport.offsetTop` | Follow `visualViewport` resize/scroll so the keyboard never covers the composer; lock page scroll while open |

The embed fills its iframe (`100dvh` of the frame), never scrolls the host page, and uses
container queries for its layout, so any panel size from 320 px wide works.

## Protocol v1

Schema: [`contracts/embed.v1.schema.json`](../contracts/embed.v1.schema.json); valid and invalid
examples: [`contracts/embed.v1.examples.json`](../contracts/embed.v1.examples.json). Every message is
a flat object `{ channel: "pequeverso-assistant", version: 1, type, …fields }` with an **exact** key
set. Unknown types, extra keys, wrong versions and wrong field types are dropped silently.

Host → assistant:

| Type | Fields | When |
|---|---|---|
| `host.init` | `theme`, `locale` (`"es"`), `visible`, `expanded`, `page`, `canExpand` | Once, in reply to the first `assistant.ready` |
| `host.state` | `visible`, `expanded` | After every minimize/reopen/expand/restore |
| `host.preferences` | `theme`, `locale` | Theme changes |
| `host.context` | `page` (`home`/`product`/`support`/`null`) | Visitor moved within a SPA-like store |
| `host.focus` | — | After opening, once `assistant.ready` reports `ready` |

Assistant → host:

| Type | Fields | Meaning |
|---|---|---|
| `assistant.ready` | `status`: `starting` / `ready` / `unavailable` | Sent on load (to each allowlisted origin) and on every status change (to the pinned origin) |
| `assistant.activity` | `state`: `idle` / `responding` / `unread` | `unread` = an answer finished while the panel was hidden: badge the launcher |
| `assistant.request` | `action`: `minimize` / `expand` / `restore` | The visitor used a panel control inside the frame (or pressed Escape) |

There is intentionally **no navigation message**: links open in new tabs, so model output can never
drive parent navigation. Nothing in the protocol carries credentials, CSRF tokens, message text,
product data or transcripts (a unit test asserts the schema has no such fields).

### Validation rules (both sides)

- Host: accept a message only if `event.origin === ASSISTANT_ORIGIN` **and**
  `event.source === iframe.contentWindow`; then validate the exact shape.
- Assistant: accept only if `event.source === window.parent` **and** `event.origin` is in
  `EMBED_ALLOWED_ORIGINS`; the first origin that sends `host.init` is pinned and every later message
  must come from it.
- Always `postMessage(message, exactOrigin)` — never `"*"`. Before initialization the assistant
  posts `assistant.ready` once per allowlisted origin; the browser discards the ones that do not
  match the parent.

### Focus and keyboard

- Opening: show the panel, then call `iframe.focus()` before sending `host.focus` (browsers only let
  a cross-origin frame move focus internally once the frame itself has focus). The assistant then
  focuses its composer. Drop a pending focus request if the visitor clicks elsewhere first.
- Escape inside the frame → `assistant.request {action:"minimize"}`. Escape while focus is in the
  host panel → minimize. After minimizing, return focus to the launcher.
- Controls inside the frame that handle Escape themselves (the "new conversation" confirmation)
  stop it, so it does not also minimize.
- Tab order follows the DOM: host controls before the panel, then the frame. The panel is not a
  modal dialog; do not trap focus across the frame boundary.
- Put the unread status in `aria-describedby` on the launcher, not inside its name.

### While minimized

Streaming continues (the answer is not cancelled). The assistant stops screen-reader announcements
and pauses every animation while `visible` is `false`, and reports `unread` when the answer
completes so the host can badge the launcher. Reopening clears `unread`.

## Headers

| Header | Where | Owner | Value |
|---|---|---|---|
| `Content-Security-Policy: frame-ancestors …` | assistant `/embed` | **Application** (`src/proxy.ts`, from `EMBED_ALLOWED_ORIGINS`) | `frame-ancestors https://pequeverso.com` (exact origins only; `'none'` when unset) |
| `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY` | every other assistant route | Application | refuse framing |
| `X-Frame-Options` | assistant `/embed` | **Must be absent** | XFO cannot express an allowlist; `SAMEORIGIN`/`DENY` there would block the store |
| `Content-Security-Policy: frame-src …` | storefront pages | **Storefront** | add `https://assistant.pequeverso.com` to `frame-src` (today: `https://*.hotmart.com https://www.facebook.com`) |
| `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'` | storefront pages | Storefront | unaffected: they govern who may frame the **store**, not what the store frames |

Reverse proxy (vps-ops / Traefik): must **not** add or override `Content-Security-Policy` or
`X-Frame-Options` for the web service. The current vps-ops renderer adds
`frame-ancestors 'none'` to every service; a Pequeverso-specific renderer must leave the web
service's CSP to the application (see [deployment-contract.md](deployment-contract.md)).

### Verified origins

- Storefront production origin: `https://pequeverso.com`, from the storefront's own configuration
  (`NEXT_PUBLIC_SITE_URL`, `.env.example`, deploy workflow) and the API catalog (`site.origin`).
  `www` redirects to the apex there, so **no `www` origin is allowlisted**.
- Local harness: `http://localhost:3210` framing `http://localhost:3207`.

## Sessions across surfaces

The session cookie is issued by the API on the assistant origin (`__Host-pv_assistant`, HttpOnly,
Secure, SameSite=Lax, per the API configuration). `pequeverso.com` and `assistant.pequeverso.com` are
**same-site**, so the cookie is sent from inside the storefront iframe even in browsers that block
third-party cookies. The standalone page on the same origin uses the same cookie: history started in
the embed appears there after a reload (verified in the harness). There is **no live cross-tab
synchronisation**: two open tabs do not update each other until reloaded.

A storefront on a *different* site (not `*.pequeverso.com`) would make the frame third-party; that
setup is not supported without further work.

## Failure and removal

- If `assistant.ready` does not arrive within ~10 s, show a small host-side fallback ("El
  asistente no está disponible ahora…") with retry/close; the store keeps working.
- `status: "unavailable"` (API disabled, budget exhausted, catalog unavailable, API unreachable):
  the frame explains it and links to `/soporte/`; the host may keep or hide its launcher.
- Removing the launcher script must leave checkout untouched (harness "Quitar asistente").

## Reference implementation

`tests/fixtures/host/host.ts` is the tested host logic (≈200 lines, no dependencies): create on
first open, handshake, focus hand-off, minimize/expand, badge, `visualViewport` sizing, fallback,
removal. Port it into the storefront's own launcher component; do not load it from this origin.
