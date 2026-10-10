# Design system

The backoffice belongs to Pequeverso, so it uses the store's identity — cream paper, navy ink,
teal accents, Fraunces for headings, Nunito Sans for reading — tuned for dense operational
reading. Coral stays reserved for commerce and is not used here (status uses teal, navy and gold). The portfolio assistant shares engineering principles with
this repository, not its visual identity.

**Single source of truth:** `src/app/globals.css`. Components use semantic Tailwind utilities
(`bg-surface`, `text-ink`, `text-copy`, …) and never raw brand values or hex codes.

## Layers

1. **Raw brand values** `--pv-*` — copied from the storefront (`pequeverso` develop `7ae5987`,
   `src/app/globals.css`), including its contrast measurements.
2. **Semantic roles** — defined for `light` (default, the storefront's only theme) and `dark` (the
   storefront's night-sky bands extended into a full reading theme).
3. **Tailwind theme** — `@theme inline` maps roles to utilities.

Theme mechanism: `<html data-theme="light|dark">`, set before first paint (`layout.tsx`, nonce
script) from the system preference. There is no in-app toggle. Both themes are covered by the
browser suite (axe and screenshots).

## Colour roles

| Role (utility) | Light | Dark | Use |
|---|---|---|---|
| `surface` | cream `#fffaf2` | navy night | Page and dashboard ground |
| `surface-raised` | white | raised navy | Cards, access forms, disclosures |
| `surface-sunken` | sky `#e8f3ff` | sunken navy | Wells, table headers, image placeholders |
| `surface-user` / `on-user` | navy / white | turquoise / ink | Retained storefront token; unused by the backoffice |
| `ink` | `#0b1f3a` | white | Headings, strong text |
| `copy` | `#425267` (7.7:1 on cream) | white 86 % | Reading text |
| `muted` | `#5d6b80` (5.2:1 on cream) | white 68 % | Notes, hints |
| `action` / `on-action` | navy / white | turquoise / ink | Sign-in, invitations, primary operations actions |
| `purchase` / `on-purchase` | coral `#c64035` / white (5.0:1) | same | Retained commerce token; unused by the backoffice |
| `amount` | coral | soft coral | Retained commerce token; unused by the backoffice |
| `link` | teal text `#005e5b` | turquoise | Inline links |
| `icon` | teal `#007d79` | turquoise | Decorative icons |
| `chip` / `on-chip` | mint / navy | white 9 % / white | Role and status badges |
| `notice` / `danger-surface` / `danger` | lemon; rose / coral-hover | tinted | Notices; failures |
| `line`, `line-strong` | navy 14 % / 28 % | white 12 % / 26 % | Borders |
| `ring` | navy | turquoise | Focus outline (3 px, offset 2 px) |

Automated axe scans pass on the backoffice pages in both themes ([verification.md](verification.md));
that is not a full contrast audit of every state. Chart series use `--chart-*` roles (never coral).

## Typography

| Utility | Size / line height | Family and weight | Use |
|---|---|---|---|
| `text-display` | 26→36 px / 1.1 | Fraunces 700 | Reserved (not used in the panel) |
| `text-heading` | 22 px / 1.2 | Fraunces 700 | Page headings |
| `text-title` | 17 px / 1.3 | Fraunces 700 | Section titles |
| `text-price` | 22 px / 1.1 | Fraunces 700, `amount` colour | Retained storefront size; unused by the backoffice |
| `text-body` | 16 px / 1.6 | Nunito Sans 500 | Reading text and inputs (16 px avoids iOS zoom on focus) |
| `text-small` | 14 px / 1.5 | Nunito Sans | Buttons, summaries |
| `text-tiny` | 13 px / 1.45 | Nunito Sans | Labels (uppercase + tracking for section labels), hints |

Fonts are self-hosted variable woff2 (OFL) with metric-matched fallbacks and preloaded; there is no
request to Google Fonts. Reading width is capped at `max-w-measure` (42 rem).

**Naming rule:** font-size and colour token names must never collide (`text-body` is a size, the
reading colour is `text-copy`; `text-price` is a size, the price colour is `text-amount`), and every
custom size is registered in `src/shared/ui/cn.ts` so `tailwind-merge` does not drop colours.

## Spacing, radius, elevation, icons

- Spacing: Tailwind's 4 px scale. Dashboard sections use 24 px gaps; page gutters are 16 px (24 px from `sm`).
- Radius: `sm` 4, `chip` 6, `md` 12 (callouts, disclosures, tables), `lg` 20 (cards),
  `xl` 28 (retained storefront token), `pill` (every button and chip, as on the storefront).
- Elevation: navy-tinted `shadow-sm` (cards) and `shadow-md` (dialogs); commerce elevation tokens
  are retained and unused.
- Icons: lucide, 20 px in buttons (`[&_svg]:size-5`), 16 px in small buttons and inline labels,
  14 px next to link text; always `aria-hidden`, never the only label.
- Touch targets: ≥ 44 px (`sm` buttons are 44 px tall; header icon buttons 44 px).

## Components (`src/shared/ui`, owned shadcn-style primitives)

| Component | Variants | Notes |
|---|---|---|
| `Button` / `LinkButton` | `action`, `outline`, `ghost`, `chip`, `link` (+ `purchase`, unused here) × `sm`, `md`, `icon`, `icon-sm` | CVA; links stay `<a>` |
| `Badge` | `chip`, `quiet`, `notice` | Catalog status, freshness |
| `Callout` | `info`, `notice`, `danger` | Status messages; caller chooses `role` |
| `Section`, `Facts`, `TableRegion` | — | Labelled dashboard regions, term/value lists that show "No disponible", keyboard-scrollable tables |
| `BrandMark` | sizes 24/32/40/56 | Isotipo |

Feature components: `Dashboard` (server component; availability, service, catalog, budget with a
native `<meter>`, runs per window, daily table and Recharts trend from two days, recent runs),
`DailyCharts` (client; no animation; SVG hidden from assistive technology because the table carries
the data), `SignInPanel` (buttons disabled until hydrated), `InviteForm` (one-time link with copy
feedback bound to that link), `ConfirmAction` (native modal `<dialog>`: Escape cancels, focus
returns to the trigger or, after success, to the section heading).

## Motion

Only state changes animate (150 ms colour/opacity transitions); charts render without animation.
`prefers-reduced-motion: reduce` collapses all durations.

## Layout rules

- Content max width 72 rem with 16 px gutters (24 px from `sm`); cards in a 3-column grid from `lg`.
- Header: brand and account on one row, navigation on its own row below `md`.
- Long values (e-mails, revisions, ids) wrap (`overflow-wrap: anywhere`); wide tables scroll
  horizontally inside a focusable region.
- Touch targets ≥ 44 px.
