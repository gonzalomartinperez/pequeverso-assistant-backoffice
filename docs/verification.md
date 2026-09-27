# Verification

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
| Safety | Foreign product URL dropped, unlisted links not rendered, markup shown as text | ✔ | shared view |
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
- No real API: joint compatibility is verified only against the API's generated example streams
  and a faithful mock, not a running API.
- Measurements (type-check/build durations, bundle size, container memory) are recorded in the
  verification increment that follows this document.
