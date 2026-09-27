# Third-party notices and provenance

This repository is proprietary (see `LICENSE`). The items below keep their own terms.

## Brand assets (Pequeverso, all rights reserved)

Copied from the owner's storefront repository `gonzalomartinperez/pequeverso` at `develop`
`7ae59873f10a8769d46e5d0f8b9901444e220e37`, where `LICENSE-CONTENT.md` reserves all rights to
"the name 'Pequeverso', the logo system (`public/media/brand/**`) and the visual identity" and to
"all images and videos under `public/media/**`". They are used here only for Pequeverso's own
assistant, by the same owner.

- `public/brand/brand-isotipo-w96-cf729aa6.webp`, `public/brand/brand-isotipo-w192-f34b1740.webp`
  (approved isotipo, `media/manifest.json` role `brand.isotipo`)
- `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-192.png`
- `tests/fixtures/storefront/media/*.webp` (product images used only by the local test harness)
- Colour, type, spacing, radius, shadow and motion values in `src/app/globals.css` are derived from
  the storefront's `src/app/globals.css` (code MIT; the visual identity itself is reserved).

## Fonts (SIL Open Font License 1.1)

- `public/fonts/fraunces-latin-wght-7f9d191d.woff2` — Fraunces (undercasetype), via
  `@fontsource-variable/fraunces@5.3.0`; licence in `public/fonts/OFL-Fraunces.txt`.
- `public/fonts/nunito-sans-latin-wght-29e38904.woff2` — Nunito Sans (Google Fonts), via
  `@fontsource-variable/nunito-sans@5.3.0`; licence in `public/fonts/OFL-NunitoSans.txt`.

Neither family declares a Reserved Font Name. Files are byte-identical to the storefront copies.

## Adapted code (MIT, © 2026 Gonzalo Martin Perez)

- SSE framing/UTF-8/size-bound approach in `src/features/assistant/adapters/sse.ts` and the
  controller structure in `src/features/assistant/application/assistant.ts` are adapted from
  `gonzalomartinperez/portfolio-assistant-web` (`develop` `f460fc4`), MIT.
- The embed origin parser and host-harness pattern follow that repository's embed work, inspected
  as uncommitted working-tree files on 2026-09-27 (not copied verbatim).
- UI primitives in `src/shared/ui/` are owned adaptations of shadcn/ui (MIT,
  https://github.com/shadcn-ui/ui); the `cn()` helper follows shadcn/ui.

## npm packages

Runtime and development dependencies keep their own licences (see `package-lock.json`); notably
`lucide-react` (ISC), `class-variance-authority` (Apache-2.0), `clsx` and `tailwind-merge` (MIT),
Next.js and React (MIT), and `@axe-core/playwright` (MPL-2.0, development only).
