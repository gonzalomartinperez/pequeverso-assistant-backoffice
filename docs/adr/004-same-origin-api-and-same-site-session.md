# ADR 004 — Same-origin API and same-site session

**Status:** superseded (2026-10-05). The public conversation moved into the storefront
(native assistant); this repository is now the private backoffice and serves no chat.

**Context.** The API issues an HttpOnly session cookie and expects a CSRF token in memory. Browsers
increasingly block third-party cookies in iframes.

**Decision.** Serve web and API on one host (proposed `assistant.pequeverso.com`, `/api/*` routed to
the API unchanged). The browser calls `/api/v1` same-origin; no CORS, no API URL in the client.
Because `pequeverso.com` and `assistant.pequeverso.com` are same-site, the cookie is sent inside the
storefront iframe without third-party cookie exceptions.

**Consequences.** Requires the approved subdomain and a proxy that keeps `/api` unbuffered. A host on
another site would need a different session design. Cross-tab updates are not live (reload restores).
