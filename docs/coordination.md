# Coordination record

Reference repositories are read-only. This file records what was inspected, at which revision, and
what was adopted. Inspections happen at milestones, not continuously.

## Milestone 1 — foundation (2026-09-27)

| Repository | Revision inspected | State | Adopted / decided |
|---|---|---|---|
| `pequeverso` (storefront) | `develop` `7ae5987` (clean) | Next 16 static/standalone, Tailwind 4, shadcn base-vega, TS 7.0.2, Spanish only, light theme, Hotmart checkout | Brand tokens, fonts, isotipo, copy tone ("tú", neutral LATAM), coral-for-purchase rule, "no invented claims" rule, verified origin `https://pequeverso.com`. TS config strictness flags. **No chat/assistant code exists** there: nothing to transfer. |
| `pequeverso-assistant-api` | `8428fce` (bootstrap) + uncommitted working tree | Domain, application, HTTP presentation and generated contracts present but **not committed** | Pinned snapshot of generated `contracts/` (see [api-contract.md](api-contract.md)). Cookie name `__Host-pv_assistant`, CSRF in memory, single conversation per session, `page` context, product `url`/`purchase_url`/nullable `price`. |
| `portfolio-assistant-web` | `develop` `f460fc4` + uncommitted `feat/embedded-assistant` | Closure external-store controller, fetch-SSE reader, node:test, harness | Adopted: controller pattern (lifetime AbortController, single-flight generation, bounded cancel, no auto-regeneration), SSE bounds, exact-key protocol validation, first-origin pinning, per-origin `assistant.ready`, host harness idea, contract manifest check, skills layout. **Not adopted:** plain CSS modules (this repo uses Tailwind), react-markdown (the API promises plain text), multi-conversation UI, the `typescript` JS-API boundary checker (TS 7 has no JS API). |
| `portfolio` (site) | `main` `45d8a42` (clean) | Tailwind 4 + shadcn radix-nova, TS 7.0.2, `next typegen && tsc --noEmit` | `@theme inline` over semantic tokens, `cn()` + CVA primitives with `data-slot`, 44 px targets, canonical skills in `.agents/skills` with Claude adapters, Biome config shape. |
| `vps-ops` | `feat/pequeverso-planning` `74d4fa5` | Planning only: no domain, routes or services for Pequeverso yet | Same-origin `/api/*` routing, no prefix stripping, digest-pinned images, read-only root + tmpfs, header conflict raised in [deployment-contract.md](deployment-contract.md). |

## Mid-milestone re-inspection (2026-09-27 17:08 UTC)

The API working tree gained `app/presentation/*` and generated `contracts/` after the first read;
routes were unchanged, `http.py` hash changed. The snapshot was re-taken from the generated
artifacts (manifest `d163b6d7…`). The storefront and vps-ops were unchanged.

## Milestone 2 — before the first release (2026-09-27 20:05 UTC)

| Repository | Revision | Change since milestone 1 | Adopted / decided |
|---|---|---|---|
| `pequeverso-assistant-api` | `develop` `dc4e4c6` (released to its `main` `207a61f`); clean tree | Everything committed; contract v1 introduced in `0750524`; committed handoffs `docs/handoffs/assistant-web.md` and `storefront-transition.md` | Repinned to the committed revision (artifacts byte-identical). Aligned with the handoff: answer text is never auto-linked; only `contact_data_redacted` shows a notice. Kept deliberately: key reuse once after an interruption (API replay semantics), "Cómo comprar" label. Live suite re-run against `dc4e4c6`: 6/6. The storefront transition confirms **no storefront chat work ever existed**, so there was nothing to hand over. |
| `pequeverso` | `develop` `7ae5987` | unchanged | — |
| `portfolio-assistant-web` | `develop` `aed8ea7`, clean tree | embed work and reviewed dependency updates committed | No change needed; this repository's protocol remains independent (no shared package). |
| `vps-ops` | `develop` `04be619` | dependency-review documentation | No Pequeverso web allocation yet; the deployment contract stands. |

Branch protection was aligned with `pequeverso-assistant-api` (`73d1f3b`, "simplify branch
protection to match the portfolio"): rulesets require pull requests and strict Required checks, block
force-pushes and deletion, and have no bypass; the branch flow and the owner-authorized hotfix rule
are a documented working agreement instead of a Branch policy check (removed to avoid friction,
after it had been verified live).

## Requests to other owners

- **API agent:** (done: contract committed.) Web revision verified together: this repository's
  `develop` after the handoff-alignment PR, against API `dc4e4c6`. Open points: a retry of a failed
  run stores the question twice (visible after reload) — consider an explicit retry semantic; keep
  the idle heartbeat ≤ 15 s (the client treats 45 s of silence as a dead stream).
- **Storefront owner (deferred integration):** see [embed-integration.md](embed-integration.md) —
  `frame-src` addition, launcher/panel port of `tests/fixtures/host/host.ts`, page context values.
- **vps-ops:** see [deployment-contract.md](deployment-contract.md) — domain approval, Pequeverso
  renderer without the `frame-ancestors 'none'` override for the web service.
- **Portfolio web (FYI):** its `scripts/check-boundaries.ts` imports the TypeScript JS API, which
  TypeScript 7 no longer ships; an import scanner (as here) avoids that dependency.

## Backoffice milestone (2026-10-05)

| Repository | Revision | Use |
|---|---|---|
| `pequeverso-assistant-api` | `develop` `87fc109` (ops contract 1.2; earlier pins `b098d6f`, `07405d2`) | `contracts/ops/` pinned with `git show`; dashboard verified against a `git archive` of `332d3c7` and `87fc109` running the fixture provider |
| `portfolio-assistant-backoffice` (local clone `portfolio-assistant-web`) | `develop` `f29b6cd`, read with `git show` only | Quality reference for the backoffice. No code or identity copied |

Adopted from the portfolio reference (adapted, own code): 48 h invitations; audit by actor id,
action, subject id and time (no e-mails); owner re-check inside each mutation's transaction;
verified e-mail required on every protected request with cookie cache disabled; database-backed
rate limits; Better Auth logger disabled with app-level redacted events; cross-subdomain cookies
explicitly off; explicit linking only from an authenticated owner (enforced server-side);
readiness-gated sign-in with a safe "unavailable" surface and `/readyz`; native modal confirmation
with Escape and focus restore; copy feedback bound to the current invitation link; fixture-safety
guards (loopback origin, issuer and database with a test/fixture name; refusal without echoing
URLs) and their tests; OAuth state-rejection and CSRF integration tests; pg pool error handling.

Kept different on purpose: committed SQL for Better Auth's schema plus `npm run db:check`
(reviewable diffs; the reference applies the library's plan at deploy time); browser tests sign
in through a fake OAuth provider instead of minting sessions; role on the user row and removal by
deleting the account (the reference keeps a member table with `revoked_at`); Spanish-only UI.
