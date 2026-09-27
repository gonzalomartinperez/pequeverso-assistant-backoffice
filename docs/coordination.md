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

## Requests to other owners

- **API agent:** commit the contract (`contracts/`), so this repository can pin a real revision;
  confirm `purchase_url` stays on the storefront origin; a retry of a failed run stores the question
  twice (visible after reload) — consider an explicit retry semantic; confirm the idle heartbeat
  (15 s) stays ≤ 15 s since the client treats 45 s of silence as a dead stream.
- **Storefront owner (deferred integration):** see [embed-integration.md](embed-integration.md) —
  `frame-src` addition, launcher/panel port of `tests/fixtures/host/host.ts`, page context values.
- **vps-ops:** see [deployment-contract.md](deployment-contract.md) — domain approval, Pequeverso
  renderer without the `frame-ancestors 'none'` override for the web service.
- **Portfolio web (FYI):** its `scripts/check-boundaries.ts` imports the TypeScript JS API, which
  TypeScript 7 no longer ships; an import scanner (as here) avoids that dependency.
