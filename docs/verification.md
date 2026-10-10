# Verification

## Backoffice

Run on 2026-10-05 (WSL2, Node 24.21.0, Next.js 16.3.6, TypeScript 7.0.2, Better Auth 1.7.7,
Recharts 3.10.1, Playwright 1.63.0, Docker 29.1.3, PostgreSQL 17.6 and 18.4 in containers).

| Suite | Command | Result |
|---|---|---|
| Types, lint, boundaries | `npm run typecheck`, `npm run lint`, `npm test` | 0 errors; 69 unit tests (access, ops contract 1.2, bounded body reading, config, CSP, fixture safety); 0 boundary violations |
| Schema drift + DB suite | `npm run test:db` (`DATABASE_URL` = disposable server) | 0 differences between `migrations/` and Better Auth; re-apply is a no-op; 17/17 integration tests on 17.6 (repeated 3×, stable) and on 18.4 (the CI image digest) |
| Browser | `TEST_DATABASE_URL=… npm run test:browser` | 31 passed, 3 skipped (the live-API spec without `LIVE_OPS_URL`) in Chromium, Firefox, WebKit, mobile Chromium; axe WCAG 2.2 AA scans, CSP-violation listener |
| Real API | `LIVE_OPS_URL=… npm run test:browser -- live-ops.spec.ts` | 3/3 engines against committed API `87fc109` (ops contract 1.2; `git archive`, fixture provider, 3 generated fixture answers incl. one in English); earlier also against `332d3c7` |
| Image | `docker build`, run `--read-only --cap-drop ALL` | migrations applied as one-shot; `/healthz` 200; `/readyz` 200 with the database and 503 without it (then `/panel` → `/ingresar?error=unavailable` and the sign-in page shows the unavailable notice); uid 1000; ~66 MiB idle; ~97 MB image |

What the integration and browser suites prove, through the real Better Auth OAuth callback with a
local fake identity provider and a real PostgreSQL: owner bootstrap; uninvited identities (also in
the owner's domain) and unverified e-mails refused with no user row; invitation single use, bound
to its e-mail, superseded, expired and revoked; no implicit account linking; viewer cannot open
access management and gets no linking controls; revocation through a native modal dialog
(Escape returns focus to the trigger, success to the section heading) ends the viewer's sessions
on the next request; OAuth state mismatch, foreign Origin and foreign callback URLs refused; no e-mail/password endpoints; nothing auth-related in
`localStorage`; neither the ops token nor the internal URL in the page; missing data rendered as
"No disponible"; one daily reading shown without a trend chart.

Not proven: real Google and GitHub OAuth apps, `__Secure-` cookies behind TLS, deployment on the
VPS, real model costs (the API ran the fixture provider; its data is labelled synthetic).

Screenshots (inspected): `verification/backoffice/` — `sign-in.png`, `desktop-dashboard.png`,
`desktop-dashboard-dark.png`, `desktop-dashboard-real-api.png`, `desktop-access.png`,
`desktop-missing-data.png`, `desktop-unavailable.png`, `desktop-revoke-dialog.png`, `mobile-dashboard-top.png`,
`mobile-dashboard-daily.png`.

The former chat shells' verification record (2026-09-27) remains in the git history.

## Continuation — 2026-10-10

The previous unit-test total was corrected to **69**: the original 2026-10-05
[CI run](https://github.com/gonzalomartinperez/pequeverso-assistant-backoffice/actions/runs/37290521328)
reports 69 tests and 69 passes, as does the clean-checkout rerun below.

Security fixes were reviewed against their primary releases: [Next 16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8)
and [source-map-js 1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).
[PR #30](https://github.com/gonzalomartinperez/pequeverso-assistant-backoffice/pull/30)
combines the patches because each separate update would leave the other advisory failing audit;
it also incorporates the existing historical release ancestry without changing files.

| Verification | Result | Measured wall time |
|---|---|---|
| Fresh worktree, `nvm use && npm ci --no-audit --no-fund` | Node 24.21.0, locked install; source-map-js 1.2.2 installed | 31.76 s |
| `npm run check` at security head `5d9fefc` | Lint, TypeScript, 69 unit tests, boundaries, public-files/docs/skills checks and Next 16.3.8 build pass | 60.67 s |
| `npm audit --audit-level=moderate` | 0 vulnerabilities | command passed |
| Local PostgreSQL 18.4 `npm run test:db` on pre-patch baseline | Schema drift 0; idempotent migration reapply; 17 integrations pass | 14.50 s |
| Local hardened baseline image `sha256:31a56442bbe7d0edc9e5d67fafd6145f51f2ab65f6cd131c5233ceed69d3da2a` | UID 1000, read-only, no capabilities, fail-closed, migrations 2 then 0, health/readiness and private headers pass; database loss gives 503; idle 76.49 MiB | 16.69 s |
| Security PR real CI | All required jobs pass; locked audit 0, database suite, exact hardened image and browser suite | 187 s workflow; see job times below |
| Security PR browser suite | 31 passed, 3 live-API tests skipped; Chromium, Firefox, WebKit and mobile Chromium | 59.8 s test suite; 174 s complete job |

[Security CI run 38012009025](https://github.com/gonzalomartinperez/pequeverso-assistant-backoffice/actions/runs/38012009025)
job durations from GitHub's actual start/end timestamps: static checks 23 s, database 26 s,
workflow lint 15 s, history secret scan 8 s, exact production image plus smoke 121 s,
backoffice browser job 174 s. These are measured runs, not promised future performance.

The first local browser attempt ran alongside multiple storefront browsers/builds: 24 passed,
two exceeded the existing 45 s total test timeout (Firefox invitation lifecycle, WebKit dark
page), one was interrupted and five did not run. CPU pressure averaged 84.79% over 60 s with no
memory pressure. After releasing the competing browser load, both failed cases passed unchanged:
Firefox lifecycle 26.0 s (27.71 s wall), WebKit dark 16.4 s (17.66 s wall). This supports contention
as the cause; the partial run is **not** counted as a green suite. The complete CI suite above
passed without a test timeout change.

Fresh local desktop light/dark, access, confirmation dialog and unavailable/missing-data
screenshots were inspected: no observed clipping, clear synthetic banner, honest missing values
and visible focus. Original mobile captures were also inspected; the complete CI suite covers
mobile again. Screenshot inspection does not prove production behavior.

The API's committed `b9ffbdacd0a19f75e1909227fd71470f6873c24d` ops schema and example were compared
with the pinned `87fc109` artifacts using `git show`: both are byte-identical (hashes in
`contracts/ops/source.json`). No repin or contract migration is needed for these revisions.

Limits remain: no deployment, real Google/GitHub credentials, TLS/proxy cookies, real model calls
or private-network integration was exercised here. The local baseline image is explicitly the
pre-patch image; the security-patched exact image is verified by the linked CI run. Release and
activation decisions require their own current checks and the deployment-contract smoke steps.

### Trusted-proxy configuration regression

The continuation review reproduced a production-config gap: the character-only IPv6 validator
accepted `::::/32`, and numeric conversion accepted scientific notation such as `::1/1e2`.
The parser now uses Node's `net.isIP` and decimal CIDR notation. It keeps the existing IPv4
`/8`–`/32` and IPv6 `/16`–`/128` bounds; valid IPv4, IPv6 and mapped IPv6 literals are accepted.
Ten focused configuration tests pass, covering malformed literals, notation and both width
boundaries. The earlier 69-unit total above describes the security-patch revision; this change
adds two configuration cases. Final runtime verification is recorded separately against the exact
candidate commit and image, and required CI exercises the updated parser before merging.

### Container quality continuation (2026-10-10)

Exact local runtime candidate source `da6691d7c7a9d1b43bb2db002289b70cc8a61194`, image
`sha256:78d9adb782ae44263ea58a286fb132361f91bde706f9c0b92a885729ca1ed0ae`: official
Node 24.21.0 base refreshed by immutable digest, PCRE2/liblzma/tzdata updates present, signed
Debian `perl-base` patch pinned, unused global npm/npx/Corepack/Yarn removed. Application code,
contracts and lockfile are unchanged from PR31 (71 units, 17 integrations, 31 browser passes).
Later changes to host smoke/docs are excluded from the runtime build context.

Hardened exact-image fixture smoke passed in 15.64 s with app ceilings 384 MiB / 1 CPU / 128
PIDs / no extra swap, 32 HTTP requests at concurrency 4, idle sample 58.3 MiB, and final cgroup
high-water 109,895,680 bytes (104.8 MiB) including database loss. Startup was 2,230 ms and idle
SIGTERM stop 300 ms with exit143, no SIGKILL/OOM. Durations use Linux monotonic uptime; an
earlier wall-clock sample became negative after a WSL/NTP clock adjustment and was discarded.
Next's installed shutdown handler closes HTTP/Next before explicitly returning143. This does
not prove authenticated transactions drain during shutdown. The actual image probe against a
hanging HTTP server failed in 2.139 s, within its separate Docker 5 s timeout.

A synthetic PostgreSQL custom dump was restored into a new isolated database: all canonical
SQL data bytes matched before/after (only randomized PostgreSQL restrict markers excluded),
including 2 users, 23 sessions, 3 invitations, 8 audit rows and 2 migration records. The same
exact image validated migration checksums (0 pending), liveness200 and readiness200 against
the restored database. This is a local fixture recovery proof; encrypted off-server backups,
auth-secret recovery, real-provider login and production RPO/RTO remain untested.

Trivy 0.75.0 scanned the exact images with a current database. Baseline findings: 264 total,
35 with available fixes; final: 228 OS findings, **0 with available fixes across all severity
levels, including UNKNOWN**, and 0 Node package findings. Remaining raw severity counts are
1 CRITICAL, 50 HIGH, 96 MEDIUM, 77 LOW and 4 UNKNOWN; they are visible, not silently accepted
or suppressed. The remaining critical zlib CVE-2023-45853 is scoped by the
[Debian security tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853) to MiniZip
which Bookworm does not build into these binary packages; exact-image `minizip` and
`libminizip1` packages are absent. This package/source assessment does not erase scanner data
or imply blanket acceptance of the other affected/deferred/will-not-fix OS findings.

Global installers occupied about 24 MiB in the baseline live filesystem. Removing them creates
whiteouts in inherited layers; measured Docker metadata/CLI image size grew rather than shrank.
No physical VPS disk saving or production capacity improvement is claimed. Shared base layers,
finite log/image retention, persistent PostgreSQL backups and monitoring budgets belong to the
authorized vps-ops handoff; no registry publication or VPS changes were performed.

### Calendar boundary regression (2026-10-10)

Release review found that a syntactically correct but impossible `daily.day` could reach the
UTC formatter and crash the dashboard (`2026-99-99`), or silently roll over (`2026-02-30`).
The adapter now requires an exact UTC calendar roundtrip for daily and optional budget days,
and validates budget months with their first calendar day. Missing optional values stay null;
the pinned API contracts and lockfile are unchanged. Invalid HTTP payloads become an unavailable
reading before presentation. Four regression tests cover invalid days/months, leap years and
safe display, missing budget values, and the HTTP failure boundary. The focused operations
suite passes 22 tests; the full unit suite passes 75 tests. Production provider calls and real
OAuth remain outside these fixture checks.

The optional live-API browser check requires exactly one completed fixture execution to be
seeded before the suite. It now checks for that data row, so an empty bookkeeping result cannot
pass merely because it has no table header.
