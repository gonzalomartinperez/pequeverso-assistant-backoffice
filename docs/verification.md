# Verification

## Backoffice

Run on 2026-10-05 (WSL2, Node 24.21.0, Next.js 16.3.6, TypeScript 7.0.2, Better Auth 1.7.7,
Recharts 3.10.1, Playwright 1.63.0, Docker 29.1.3, PostgreSQL 17.6 and 18.4 in containers).

| Suite | Command | Result |
|---|---|---|
| Types, lint, boundaries | `npm run typecheck`, `npm run lint`, `npm test` | 0 errors; 108 unit tests (access, ops contract 1.2, config, CSP, fixture safety); 0 boundary violations |
| Schema drift + DB suite | `npm run test:db` (`DATABASE_URL` = disposable server) | 0 differences between `migrations/` and Better Auth; re-apply is a no-op; 13/13 integration tests on 17.6 (repeated 4×, stable) and on 18.4 (the CI image digest) |
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
