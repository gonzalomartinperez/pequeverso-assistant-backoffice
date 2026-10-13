# Verification

## Current reconciliation — 2026-10-13

Main `f96d30d5622b11077d6ab79736fde3f1e6e146fa` incorporates
[runtime PR #49](https://github.com/gonzalomartinperez/pequeverso-assistant-backoffice/pull/49)
through [release PR #50](https://github.com/gonzalomartinperez/pequeverso-assistant-backoffice/pull/50).
The release source tree matches develop `2c26e92` and the CI synthetic merge tree.
[CI 38384606345](https://github.com/gonzalomartinperez/pequeverso-assistant-backoffice/actions/runs/38384606345)
passed all seven jobs: 89 unit tests, 17 database integrations, production-image smoke and
51 browser passes with three optional live-API skips. Independent agent inspection of the
raw report found 54 attempts, no retry, no flake and no unexpected result; this is not human
review or a post-main run. The fixture image smoke measured 32 requests, concurrency four,
1,550 ms startup and 390 ms shutdown. It does not prove VPS or authenticated transaction drainage.

A fresh isolated worktree at `2c26e92` verified the procedure correction with Node24.21.0,
Next.js16.4.0, Playwright1.64.0 and disposable pinned PostgreSQL18.6:

- `npm ci --no-audit --no-fund` and `npm run check` passed: 89 unit tests, 89 valid local
  documentation links, three validated skills and the production build.
- `npm run test:db` passed all 17 integrations with zero schema differences (4.08 s).
- The initial browser run (198.793 s) had 35 passes, three optional skips and 16 Firefox
  launch failures because the required Firefox1555 executable was absent. This run is retained
  as an environment failure, not a green suite.
- After installing the exact Firefox executable, a separate explicit all-project run with
  `--retries=0` passed 51 tests with three optional live-API skips (265.017 s): Chromium,
  Firefox, WebKit and mobile Chromium. Existing cached browsers were preserved.

The canonical verification skill now uses the distroless UID/GID65532 for its mode0700 cache
tmpfs and requires BuildKit for the Dockerfile cache mount. This documentation-only correction
does not rebuild a local image or relabel historical UID1000 images, scans or gallery captures.
Real OAuth, TLS/proxy cookies, private API networking, exact-image scan provenance, VPS capacity
and effective production restore remain separate acceptance tasks. Older records below retain
their original versions, failures and limits.

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

## Availability candidate — 2026-10-12 (acceptance incomplete)

The last complete local `npm run check` passed at `def022e` in 116.39 s with 89 unit tests.
The PostgreSQL 18.6 database suite subsequently passed 17/17 in 11.38 s. These results do not
validate every later candidate change or its exact application image.

The first browser run at `cf2457a` finished with 33 passed, 8 failed and 3 optional live-API
specifications skipped in 550.81 s. Seven failures exposed incorrect new test assumptions
(old fixture wording and repeated OAuth despite an existing session); `e6702cb` corrected
those tests without changing admission, permissions or timeout budgets. One WebKit IAM
lifecycle test exhausted its 45-second budget.

The affected run at `e6702cb` finished with 6 passed and 4 failed in 429.34 s. The optional
telemetry fallbacks passed in all three engines; technical observations passed in Firefox,
WebKit and mobile Chromium. Three IAM lifecycle cases and Chromium technical observation
exhausted the unchanged 45-second per-test limit, including axe `frame.evaluate` and reload
operations. Trace actions lasting roughly 3–15 s were recorded. No cause, CPU attribution or
flaky designation is established. The dependent full suite did not run after that failure.

The harness creates a random disposable database for each process; inspection disproved the
hypothesis that identities from an earlier run contaminated the next database. Failure logs,
contexts, traces and screenshots were preserved outside the repository. Preview timestamp
coherence and wording were then corrected in `9795fbb`; the pinned examples stayed unchanged.

Remaining finite gates: complete check at the final head; full dedicated CI browser suite
with its existing accessibility, CSP and real fake-provider OAuth assertions; inspected
light/dark/mobile screenshots; exact application and PostgreSQL 18.6 migration, backup/restore,
read-only/non-root and private observability smoke; exact-image inventory and security review;
independent review and green required CI. No deployment or real OAuth/provider acceptance is
implied. Both private source pins now name integrated API commit `b7dcb0c` (API PR39). The summary1.2
schema/example remain byte-identical to `87fc109`; the telemetry1.0 schema/example remain
byte-identical to `03898d8` and the temporary accessible pin `debb678`. All four recorded
SHA-256 hashes were verified against `git show b7dcb0c:<path>`. This metadata update does not
establish end-to-end acceptance of the final images.

### Exact local evidence at runtime `11f13a5` (2026-10-12)

The complete `npm run check` passed in 110.72 s with 89 unit tests. The exact application
image `sha256:536698d8aa8ba6d1507ae7c6044ca52a82935548d4bb4aab4468149caea83605`
and PostgreSQL 18.6 Bookworm image
`sha256:45445d0130d9a1f98f179979a5d5885c911a3ecdb5cf9c1554bc1905bbc756d4`
passed their shipped local smoke scripts in 23.14 s and 64.92 s respectively. The database
smoke checks non-root/read-only quotas, durable settings, 2000/2000 transactions with zero
failures, synthetic IAM dump/restore content hashes, restart persistence and exact-app
migration/readiness. These are measured local fixture drills, not capacity or deployment proof.

A separate actual-image test used the real Better Auth test-provider callback, not SQL session
insertion. Missing, incorrect and API-client tokens each received 401 from the backoffice
metrics route; its separate bearer received 200. Readiness and protected-panel operations
increased counters across the compiled route/RSC boundary. Node JSON and Python protobuf OTLP
payloads reached an isolated collector; both private summary/telemetry client span IDs matched
API child-parent IDs in the same traces. Export batches were 2 successful/0 failed. This took
119.72 s against API route-classification candidate image `sha256:48435fc564ff353b9590e9ebed033425d23615815f29a9d69112b88e0b76bf57`,
with fixture provider, zero model requests and all own resources removed afterwards.
Earlier failed attempts exposed external collector assumptions about protobuf-only and
Content-Length framing; bounded JSON/protobuf/chunked decoding resolved them without product
source changes. Those failed receipts were preserved rather than discarded.

Fresh independent Trivy 0.75 scans at these exact image IDs reported 228 OS rows/99 distinct
CVEs for the app (1 CRITICAL, 50 HIGH, zero Node findings and zero available fixes), and
383 OS rows/134 distinct CVEs for PostgreSQL (2 CRITICAL, 63 HIGH, zero available fixes).
The complete inventories, including other severities, remain visible in the external receipts;
SBOM inventories contain 130 and 143 components. A source-package MiniZip applicability note
is not suppression. PostgreSQL's required XML support retains the affected libxml2
CVE-2026-6653; the absence of an available stable-base fix is not risk acceptance or readiness.
The same-version Debian 13 transition has its own baseline receipts below; it never inherits these Bookworm scans.

The complete local browser run at capture checkout `5515732` finished in 521.88 s:
**40 passed, 1 Firefox IAM lifecycle timeout, 3 optional LIVE_OPS skips, zero retries**.
The 45-second deadline remains unchanged. Recorded final revocation/redirect assertions passed,
but the run still failed; no CPU cause or flaky label is established. This does not certify
external OAuth or real-provider behavior. Its private traces and original failed/publication-held
captures are preserved outside the repository.

The [current 26-image gallery](verification/availability-2026-10-12/README.md) was captured from
the actual local production build with MOCK data at DPR2. Both author and independent root
agents inspected every final image. Four mobile framing/focus originals were held and replaced
by actual complete-section/keyboard-focus captures; two right-scrolled table states were added.
Desktop and mobile images are not composited or retouched. This visual acceptance is separate
from browser/CI acceptance, provider quality and production deployment. Final feature CI,
container-base comparison and the corresponding exact final artifact checks remain finite gates.

### Public capture privacy regression

The `f97d74b` test-only change keeps the one-time invitation URL in test memory, reloads the
actual access-management page, and requires the link to disappear while its pending row
persists before publishing the access screenshot. All subsequent intruder, viewer, spent-link
and revocation assertions remain intact. Mobile daily capture now covers the complete labelled
section. No application/auth code, deadline or retry policy changed. The focused Chromium IAM,
Chromium owner and mobile owner checks passed 3/3 in 36.43 s with zero retries.

Eight refreshed `verification/backoffice/` PNGs were independently inspected at their current
bytes; the invitation-token-bearing original is held privately outside the repository, and the
accidentally clipped mobile original is retained as failed framing evidence. The current access
capture contains no invitation URL/token. The 26-image gallery is unchanged and separately
hash-bound. The unchanged sign-in/live-API legacy images and the 2026-10-05 metrics remain
historical records; refreshed images do not re-date those test results or turn the failed full
2026-10-12 browser run green.

### Debian 13 infrastructure baseline `3c88447` (2026-10-13)

The adopted same-version Node 24.21.0/PostgreSQL 18.6 Trixie Docker changes have separate
local immutable artifacts: app `sha256:e2f59fecf6b686fe4086897c032a7e85a0c62c89477a4c6c275377c2a28f25b4`
and PostgreSQL `sha256:afcb89c0b8d3c92ffdc98e28b58b9972292f0d90b9ffb8181a305719e768d2c1`.
Their original OCI revision remains `3c88447`; these images contain the preceding UI, not the
new compact layout. The shipped app/PG smoke commands passed in 38.40 s / 106.58 s: non-root,
read-only quotas/no extra swap, health/readiness and DB loss, idempotent migrations, durable
settings, 2000/2000 synthetic IAM transactions with zero failures, dump/restore hashes,
restart and normal bounded termination. Real Better Auth fake-provider callbacks also
verified separate metrics bearer 401/200 gates, shared readiness/RSC counters and actual
Node JSON/Python protobuf OTLP with both private W3C parent relationships. Zero model requests
were made. No elapsed-time benchmark is inferred from the correlation receipt.

Fresh independent Trivy 0.75 scans (DB updated 2026-10-12 19:08 UTC) identified Debian 13.7.
The app had 162 OS rows/71 distinct CVEs: 0 CRITICAL, 43 HIGH, 58 MEDIUM, 60 LOW, 1 UNKNOWN;
PostgreSQL had 303 rows/117 CVEs: 1 CRITICAL, 61 HIGH, 108 MEDIUM, 126 LOW, 7 UNKNOWN.
No Node vulnerability rows or available fixed versions were reported. SBOMs contained
121/144 components respectively. PostgreSQL's actual required libxml2 CVE-2026-6653 remains
vulnerable with a deferred fix: fewer rows or zero available fixes do not grant risk
acceptance, certify exploitability or make production ready. The signed APT verifier is SQV;
required Trixie SQLite is retained rather than forcibly removed.

Image inspect Size fields were 98,461,515 (app) / 163,029,028 (PG) bytes versus the previous
98,999,626/159,670,971. PostgreSQL metadata grew; inherited layers/whiteouts and shared storage
prevent inferring physical disk reclamation from these numbers. Local single sequential
samples also had slower startup/stop; no general performance improvement is claimed.
Fresh-volume six-label UTF8 logical restore preserved content/order/restart while libc
collation changed 2.36→2.41. This does not certify production indexes or allow automatic
physical-volume reuse.

The new compact dashboard is a later source change. Its enlarged-text gate found real
320 px document overflow; content-free DOM/Range diagnostics isolated header/control wrapping,
implicit grid tracks and a native summary word. Diagnostic CSSOM trials 662→329→320 were not
published screenshots or final production acceptance. Corrected-source production build,
four widths at 200% across browsers, full 48-case suite, final gallery and exact new app
image smoke/scan remain pending. The older 34 public captures are retained as an explicitly
identified baseline until final recapture; they are not relabelled as this redesign.

## Compact dashboard candidate — 2026-10-13

Runtime build source `e91b15e190dfdd024f780e61886a67925cdf4f77` passed `npm run check` in
161.78 s: 89 unit tests, lint/types/boundaries, 77 documentation links, 3 skills, public-file
checks and the production Next.js build. PostgreSQL 18.6 on the immutable Trixie artifact
passed all 17 integrations in 17.618 s wrapper time (12.769 s test runner), with zero schema
drift and idempotent migration reapply. Negative fixture URLs are rejected before loading
Better Auth; the original 15 s bootstrap failure is retained as historical evidence.

The original 48-case browser run had 42 passes, 3 optional LIVE_OPS skips and 3 deadline
failures in 866.433 s. The two existing axe audits were then moved into dedicated cases with
real OAuth/invitation setup and the same accessibility tags. Every functional IAM assertion
and the continuous four-width reflow case stayed in place; the timeout stayed 45 s and local
retries stayed zero. The complete discovered suite at test source `1f732169` reports **49
passes, 3 optional LIVE_OPS skips and 2 deadline failures in 805.279 s**, not a green run.
Runtime application code remains byte-identical to the e91 build.

The Firefox revocation-dialog audit produced zero violations and its assertion completed
within 44.604 s, but the overall case timed out during finalization; that case is not a pass.
The WebKit functional IAM case timed out around confirmation: revocation and the next-request
refusal were not verified by that local case. No false accessibility or business assertion
was demonstrated by these traces, and no host-contention cause is asserted. Raw failures are
preserved; a later CI run must be assessed independently and does not erase them.

Continuous 200% text reflow at 320, 390, 768 and 1440 CSS px passed in Chromium, Firefox,
WebKit and mobile Chromium. All final [26 compact screenshots](verification/compact-availability-2026-10-13/README.md)
were inspected by both capture and independent root agents. These static synthetic mock
photos prove framing and visible states, not live telemetry, model quality or deployment.
The existing 3c88447 Trixie PostgreSQL artifact and its restore/scan receipts keep their own
image identity. The redesigned final application image and full remote CI are still pending;
previous image smoke or vulnerability scans must not be attributed to a different image ID.

The later test-only source `7418120d6bacaab825aeade6b77310099a01aba3` adds a native
instant scroll to the document top immediately before the existing mobile top photo, without
changing assertions or budgets. The one owner-dashboard mobile case passed in 34.9 s
(43.2 s Playwright suite; 48.478 s outer wrapper) with no retries. Its native Pixel 7 configuration
is 412×839 CSS px, DPR 2.625; it is separate from the gallery's 390×844/DPR 2 photos.
An initial external anchored selector discovered zero tests and exited 1; its diagnostic
receipt remains preserved, and it is not counted as a browser case. This focused pass does
not replace the failed complete-suite result above.
