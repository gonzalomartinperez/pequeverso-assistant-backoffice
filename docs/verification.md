# Verification

## Backoffice

Run on 2026-10-05 (WSL2, Node 24.21.0, Next.js 16.3.6, TypeScript 7.0.2, Better Auth 1.7.7,
Recharts 3.10.1, Playwright 1.63.0, Docker 29.1.3, PostgreSQL 17.6 and 18.4 in containers).

| Suite | Command | Result |
|---|---|---|
| Types, lint, boundaries | `npm run typecheck`, `npm run lint`, `npm test` | 0 errors; 116 unit tests (access, ops contract 1.2, bounded body reading, config, CSP, fixture safety); 0 boundary violations |
| Schema drift + DB suite | `npm run test:db` (`DATABASE_URL` = disposable server) | 0 differences between `migrations/` and Better Auth; re-apply is a no-op; 17/17 integration tests on 17.6 (repeated 3×, stable) and on 18.4 (the CI image digest) |
| Browser | `TEST_DATABASE_URL=… npm run test:backoffice` | 31 passed, 3 skipped (the live-API spec without `LIVE_OPS_URL`) in Chromium, Firefox, WebKit, mobile Chromium; axe WCAG 2.2 AA scans, CSP-violation listener |
| Real API | `LIVE_OPS_URL=… npm run test:backoffice -- live-ops.spec.ts` | 3/3 engines against committed API `87fc109` (ops contract 1.2; `git archive`, fixture provider, 3 generated fixture answers incl. one in English); earlier also against `332d3c7` |
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

## Legacy chat (to be removed)

Measured facts are separated from visual judgment. Everything here ran against the deterministic
**mock** API and the local storefront **harness**; nothing ran against the real API, a real
storefront or production.

## Environment

WSL2 (Linux 6.18), Node 24.21.0, Next.js 16.3.6, TypeScript 7.0.2, Playwright 1.63.0
(Chromium 1243, Firefox 1543, WebKit 2359), Docker 29.1.3. Date: 2026-09-27.

## Automated results (local)

| Suite | Command | Result |
|---|---|---|
| Lint/format | `npm run lint` | Biome: 0 errors, 0 warnings |
| Types | `npm run typecheck` | TypeScript 7.0.2: 0 errors (app, tests, scripts, harness host) |
| Unit, contract, boundaries | `npm test` | 11/11 pinned artifacts; 48/48 tests; 40 modules, 0 boundary violations |
| Repository checks | `security:check`, `docs:check`, `skills:check` | 0 findings / 0 missing links / 4 skills, 0 problems |
| Build | `npm run build` | passes; TypeScript run by Next's CLI checker |
| Browser | `npm run test:browser` | **107 passed, 6 skipped, 0 failed** (Chromium, Firefox, WebKit, Pixel 7, iPhone 15) |

Skips are intentional: the mobile-panel layout test on the three desktop projects, the
frame-ancestors enforcement check outside Chromium, and WebKit's Shift+Tab step (see limitations).

## Real API integration

Joint verification against a **running** pequeverso-assistant-api (fixture provider, paid AI
disabled), not the mock: **6/6 passed** in Chromium and WebKit (`npm run test:live`).

| Item | Value |
|---|---|
| API state | **Committed** `pequeverso-assistant-api` `develop` `dc4e4c6` (`git archive`), contract manifest `d163b6d7…` = the pinned contract. An earlier run against the same contract from the API's then-uncommitted tree also passed 6/6. |
| API settings | `AI_PROVIDER=fixture`, `ALLOW_PAID_AI=false`, `FIXTURE_CHUNK_DELAY_MS=350`, `ALLOWED_ORIGINS=["http://localhost:3207"]`, SQLite in a scratch directory; `/health/ready` reported catalog revision `ae6d237877c2`, `price_status: verified` |
| Web settings | production build, `STOREFRONT_ORIGIN=https://pequeverso.com`, `EMBED_ALLOWED_ORIGINS=http://localhost:3210` |
| Covered | embedded streamed answer with verified price card, resources, sources and API follow-ups; stop → `run.cancelled` → retry; history restored after reload; same session in the standalone page; `DELETE /session` clears history |

Reproduce: run the API from a copy of its repository with the settings above on `:8000`, then
`npm run build && npm run live:stack` and `npm run test:live`. Screenshot:
`screenshots/live-chromium-embed-real-api.png`.

## Measurements

Same WSL2 machine, which other workloads shared, so absolute times vary ±40 % between runs.
Development-tool speed and browser performance are reported separately.

### TypeScript 7.0.2 vs 5.9.3 (developer tooling)

Two isolated copies of the same source, identical lockfile except `typescript`; cold runs.

| Measure | TypeScript 7.0.2 | TypeScript 5.9.3 | Finding |
|---|---|---|---|
| `tsc --noEmit`, whole project (3 runs) | 2.3 / 3.2 / 3.3 s | 7.3 / 9.6 / 6.3 s | ≈ 2.3× faster (median 3.2 s vs 7.3 s) |
| Type-check step inside `next build` (6 interleaved builds) | 1.2 / 1.9 / 1.2 s | 8.7 / 14.3 / 5.5 s | 4–7× faster in every pair |
| Whole `next build`, interleaved pairs | 68 / 110 / 60 s | 79 / 105 / 62 s | **within noise**: webpack compile (13–21 s both), page generation and tracing dominate; no total-build gain is claimed |

A faster checker does not change what ships to browsers: the client bundle is identical.

### Browser (production build, Chromium desktop)

| Measure | Result |
|---|---|
| JavaScript loaded by `/embed` | 7 scripts, 528 KB raw / **157 KB gzip** (≈ 127 KB Next.js + React runtime, ≈ 30 KB this app: feature 16 KB, icons + primitives 12 KB, page 2.3 KB); `/` is the same within 1 KB. Legacy polyfills (40 KB gz) are not loaded by modern browsers. |
| CSS | 30 KB raw (one file, Tailwind output) |
| Streaming a 12-part answer in the embedded panel, native CPU | 0 long tasks, 0 ms total blocking time |
| Same, 4× CPU throttling | 5 long tasks, max 131 ms, 164 ms total blocking time |
| Event Timing, embedded interactions (type, send, minimize, reopen, expand, restore) | max keydown 16 ms / click 24 ms native; 96 ms / 48 ms at 4× throttling |

Structural guarantees behind these numbers: the committed transcript is memoized and keeps the same
props while tokens arrive (only the draft re-renders), answers are parsed by a linear-time parser,
and no animation runs per token.

### Production container

| Measure | Result |
|---|---|
| Image | 96 MB (`docker image inspect` size), `linux/amd64` |
| Runtime | UID 1000, read-only root, `/tmp` + 32 MiB `.next/cache` tmpfs, all capabilities dropped, `healthy` |
| Memory | ≈ 51 MiB idle; ≈ 224 MiB immediately after 400 concurrent page renders |
| SIGTERM | exits at once with code 143 (signal); acceptable because the web tier holds no streams (SSE goes to the API) |
| Headers | `/embed`: `frame-ancestors https://pequeverso.com`, `Cache-Control: private, no-store`, no `X-Frame-Options` |

CI (GitHub Actions, PR #1): static checks, image build, and the full browser suite **against this
image** — 107 passed, 6 skipped.

## Acceptance matrix

Embedded (primary) criteria are verified through the cross-origin harness at real panel sizes.
✔ = automated test in all five projects unless noted; ◐ = partially / with a documented limit.

| Area | Criterion | Embedded | Standalone |
|---|---|---|---|
| Loading | Iframe created on first open, handshake, ready | ✔ | n/a |
| Loading | Offline API → explanation + reconnect | ✔ | shared view |
| Answer | Streamed answer, verified product card with price, note and date | ✔ | ✔ |
| Answer | Sources disclosure, useful links, follow-up chips | ✔ | ✔ |
| Answer | Price omitted when the API sends none (unit: API example) | ✔ | ✔ |
| Safety | Foreign product URL dropped, unlisted links not rendered, answer text never linkified, markup shown as text | ✔ | shared view |
| Streaming | Stop keeps partial text; retry succeeds | ✔ | shared view |
| Streaming | Interrupted stream (EOF, stall ≥ 45 s) reported with partial text | ✔ (+ unit) | shared view |
| Streaming | No forced scroll while rereading; jump-to-latest control | ✔ | shared view |
| Failures | Failed run, busy refusal (question restored), expired session (notice + question restored) | ✔ | shared view |
| Failures | Budget exhausted → questions disabled, support link, store usable | ✔ | shared view |
| Failures | Iframe unreachable → host fallback; removal leaves the page working | ✔ (harness) | n/a |
| Continuity | Minimize/reopen keeps the same document and conversation | ✔ | n/a |
| Continuity | Expand/restore resizes without remount | ✔ (desktop) | n/a |
| Continuity | Streaming continues while minimized; unread badge | ✔ | n/a |
| Continuity | History restored after reload with one session request | ✔ | ✔ (shared session with embed) |
| Keyboard | Enter opens; focus enters the frame; Escape minimizes and returns focus to the launcher | ✔ ◐ WebKit: composer needs a click/Tab | n/a |
| Keyboard | Escape in the clear confirmation closes only it; focus returns | ✔ | ✔ (same control) |
| Keyboard | Shift+Tab from composer reaches the follow-ups | ✔ Chromium/Firefox ◐ WebKit default | shared view |
| Hidden panel | `inert`, out of tab order, animations paused, announcements silenced | ✔ | n/a |
| Mobile | Near-full-viewport panel, composer on screen, targets ≥ 40–44 px | ✔ Pixel 7, iPhone 15 | ✔ |
| Mobile | No auto-focus/keyboard pop on touch | ✔ | n/a |
| Zoom/motion | 200 % zoom equivalent without horizontal scroll; no running animations with reduced motion | ✔ | — |
| Themes | Light and dark; automated WCAG 2.2 A/AA scan clean in both | ✔ | ✔ |
| Protocol | Invalid messages and a hostile sibling frame ignored | ✔ | n/a |
| Headers | `/embed` frame-ancestors = allowlist, no XFO; other routes DENY | ✔ | ✔ |
| Locale | Spanish (the only locale the storefront and API support) | ✔ | ✔ |

## Visual review (judgment, from rendered screenshots)

Findings fixed during review: dark text on the coral purchase button (a `tailwind-merge` /
token-name collision), stretched avatar, half-width single product card in the expanded panel,
avatar column wasting width on phones and the compact panel, spurious "jump to latest" button
caused by a scroll race, duplicated failure + unavailable messages, empty hint row on touch.

## Known limitations

- **WebKit focus:** WebKit ignores `focus()` inside a cross-origin frame without a user gesture
  there, even after the host focuses the iframe. Focus reaches the frame document (Escape and Tab
  work); the composer needs one click or Tab. Real Safari/iOS was not tested.
- **WebKit Tab order:** like Safari's default, WebKit only tabs to form controls, so buttons are
  skipped unless the user enables full keyboard access. Platform behavior, not app logic.
- Screen-reader behavior (NVDA, VoiceOver, TalkBack) and real devices were **not** tested; axe scans
  are not proof of accessibility.
