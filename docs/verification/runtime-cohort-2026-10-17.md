# Fixed runtime cohort — 2026-10-17, 17:35 UTC

This manually reviewed dependency change selects Node 24.22.0 LTS, Playwright 1.64.1 and
Better Auth 1.7.10. Next 16.4.2/React 19.3.1 already reached main through security release PR60;
PostgreSQL 18.6, TypeScript 7, private ops 1.2/telemetry 1.0 and application SQL remain unchanged.
No new authentication provider, plugin, public signup, implicit linking or deployment trigger
is enabled. The historical dashboard release `f96d30d` and its measurements remain history.

## Primary review and compatibility

- [Node 24.22.0](https://nodejs.org/en/blog/release/v24.22.0) stays within Node 24 LTS. New APIs
  do not establish a performance improvement for this application. The exact builder and
  distroless runtime digests in the Dockerfile were independently probed as UID 65532, with
  read-only root, no network, dropped capabilities and bounded resources. Both report
  Node 24.22.0, module ABI 137, OpenSSL 3.5.8 and linux/x64. This is interpreter compatibility
  evidence, not a full application image test or registry publication.
- [Playwright 1.64.1](https://github.com/microsoft/playwright/releases/tag/v1.64.1) repairs
  Electron startup and a Chromium 155 cross-origin redirect regression with route interception.
  Test, Playwright and core versions must remain aligned. Keep existing browser coverage and
  use `PLAYWRIGHT_SKIP_BROWSER_GC=1` or an isolated `PLAYWRIGHT_BROWSERS_PATH` when installing
  the matching browsers; never clean a shared cache or replace missing-browser failures with skips.
- Cumulative Better Auth releases [1.7.8](https://github.com/better-auth/better-auth/releases/tag/v1.7.8),
  [1.7.9](https://github.com/better-auth/better-auth/releases/tag/v1.7.9) and
  [1.7.10](https://github.com/better-auth/better-auth/releases/tag/v1.7.10) change cookie handling,
  async initialization/error paths and core JWKS verification. Official npm peers include
  Next 16, React 19 and pg 8. The resolved core/adapters/telemetry cohort and transitive lock
  changes require review; a patch number does not make authentication changes low risk.

The actual lock advances Better Auth core/adapters/telemetry together, utils 0.4.2→0.5.0,
better-call 1.4.0→1.4.2, Kysely 0.29.6→0.29.7, nanostores 1.5.4→1.5.5,
set-cookie-parser 3.1.2→3.1.4 and Zod 4.6.5→4.6.7; the duplicated nested utils entry disappears.
[Utils 0.5.0](https://github.com/better-auth/utils/releases/tag/v0.5.0) tightens encoder types
for bigint arrays; [better-call 1.4.2](https://github.com/better-auth/better-call/releases/tag/v1.4.2)
corrects exact-optional typing. Strict checking, actual emitted cookies, schema drift and the
real callback suite exercise the relevant closure; no compiler flags are relaxed.

The upstream [JWKS refetch fix](https://github.com/better-auth/better-auth/pull/11805) bounds
unknown-key refetches, shares concurrent work and limits waiting; newly rotated keys and slow
endpoints can therefore behave differently. [Unreachable JWKS classification](https://github.com/better-auth/better-auth/pull/11612)
also changes. This app does not enable JWT, OAuth-provider, MCP or SCIM plugins. Its fake IdP
returns an opaque token and userinfo, so those local tests do not prove real Google JWKS/key
rotation. Do not enable an unused plugin merely to claim such coverage or add provider fallback.

The portfolio backoffice was read only through immutable commit
`2581dec08f1f9c44af2bd6b5e6df9d3f967a8c43` (Dockerfile, runtime review and verification notes).
Its independently tested pins inform this review; its tests and measurements do not certify
Pequeverso. No working tree, assets, application identity or infrastructure were copied.

## Meaningful regression and acceptance gates

The real Better Auth/PostgreSQL OAuth integration tests now inspect emitted `Set-Cookie`
attributes instead of only asserting configuration strings. HTTP loopback and an HTTPS-configured
handler callback must emit HttpOnly, SameSite=Lax, root Path and no Domain; Secure must match
the configured origin. Assertions keep only public attribute booleans, never session values.
The HTTPS handler test is synthetic request handling: it does not perform TLS or prove browser
cookie storage, the reverse proxy or a real provider registration.

Before acceptance, run frozen `npm ci`, audit, `npm run check`, disposable PostgreSQL schema
drift/idempotence and every IAM integration test, then the complete fake-IdP browser suite.
Require current-head protected CI, independent review, hardened exact-image startup/readiness,
database-loss behavior and the exact PostgreSQL artifact's restore test. Existing migration
checksums are immutable; any unexpected schema drift requires investigation, not an automatic
production migration or a weakened test. Record actual counts and image IDs in the PR and
verification receipts; earlier image measurements cannot be relabeled as this cohort.

## Local verification

Frozen `npm ci` completed with Node 24.22.0/npm 11.19.1. `npm run check` passed:
100 unit/contract/boundary tests (2.925 s), strict TypeScript, production build, public-file
checks, 94 local documentation links and all three skills. `npm audit` reported no known
npm advisories; that does not establish the absence of image/OS vulnerabilities.

Disposable PostgreSQL 18.6 returned zero schema differences and the second migration run
applied nothing. All 18 integration tests passed in 4.075 s, including emitted HTTP loopback
session cookie attributes and the HTTPS-configured callback's Secure attribute. These results
exercise the real Better Auth handler and PostgreSQL, with the local fake identity provider.

The complete Playwright 1.64.1 suite passed 51 tests in 6.2 minutes across Chromium,
Firefox, WebKit and the mobile Chromium project, with no retries or failures. Three optional
real-API reading tests were skipped because no live operations endpoint was configured.
Desktop light/dark and mobile dashboard PNGs were inspected by the coding agent: fixture
labels, hierarchy and controls remained legible, with no unexpected page overflow. Generated
verification PNGs are retained locally outside Git; this dependency change does not replace
the historical README gallery or claim human review.

No real OAuth, paid model call, provider key, VPS load, image publication or deployment is part
of this maintenance. Live HTTPS/proxy cookies, provider JWKS behavior, production capacity,
current image SBOM/scans and off-server recovery remain separate operator gates.
