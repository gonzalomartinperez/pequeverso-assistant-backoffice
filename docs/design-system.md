# Design system

The assistant is part of the Pequeverso store, so it uses the store's identity — cream paper,
navy ink, teal accents, coral reserved for purchase, Fraunces for headings, Nunito Sans for reading —
tuned for a compact reading surface. The portfolio assistant shares engineering principles with
this repository, not its visual identity.

**Single source of truth:** `src/app/globals.css`. Components use semantic Tailwind utilities
(`bg-surface`, `text-ink`, `text-copy`, …) and never raw brand values or hex codes.

## Layers

1. **Raw brand values** `--pv-*` — copied from the storefront (`pequeverso` develop `7ae5987`,
   `src/app/globals.css`), including its contrast measurements.
2. **Semantic roles** — defined for `light` (default, the storefront's only theme) and `dark` (the
   storefront's night-sky bands extended into a full reading theme).
3. **Tailwind theme** — `@theme inline` maps roles to utilities.

Theme mechanism: `<html data-theme="light|dark">`, set before first paint (`layout.tsx`). Embed: the
host's `theme` (URL hint, then protocol). Standalone: stored choice or system preference, with a
toggle. Nothing else changes theme.

## Colour roles

| Role (utility) | Light | Dark | Use |
|---|---|---|---|
| `surface` | cream `#fffaf2` | navy night | Page and transcript ground |
| `surface-raised` | white | raised navy | Cards, composer, disclosures |
| `surface-sunken` | sky `#e8f3ff` | sunken navy | Wells, table headers, image placeholders |
| `surface-user` / `on-user` | navy / white | turquoise / ink | Visitor message bubble |
| `ink` | `#0b1f3a` | white | Headings, strong text |
| `copy` | `#425267` (7.7:1 on cream) | white 86 % | Reading text |
| `muted` | `#5d6b80` (5.2:1 on cream) | white 68 % | Notes, hints |
| `action` / `on-action` | navy / white | turquoise / ink | Send, retry, primary non-purchase actions |
| `purchase` / `on-purchase` | coral `#c64035` / white (5.0:1) | same | **Only** the "Cómo comprar" action |
| `amount` | coral | soft coral | **Only** verified prices |
| `link` | teal text `#005e5b` | turquoise | Inline links |
| `icon` | teal `#007d79` | turquoise | Decorative icons |
| `chip` / `on-chip` | mint / navy | white 9 % / white | Starters and follow-ups |
| `notice` / `danger-surface` / `danger` | lemon; rose / coral-hover | tinted | Notices; failures |
| `line`, `line-strong` | navy 14 % / 28 % | white 12 % / 26 % | Borders |
| `ring` | navy | turquoise | Focus outline (3 px, offset 2 px) |

Automated axe scans pass in both themes in the embedded and standalone surfaces
([verification.md](verification.md)); that is not a full contrast audit of every state.

## Typography

| Utility | Size / line height | Family and weight | Use |
|---|---|---|---|
| `text-display` | 26→36 px / 1.1 | Fraunces 700 | Reserved (not used in the panel) |
| `text-heading` | 22 px / 1.2 | Fraunces 700 | Greeting |
| `text-title` | 17 px / 1.3 | Fraunces 700 | Panel title, product names |
| `text-price` | 22 px / 1.1 | Fraunces 700, `amount` colour | Verified price |
| `text-body` | 16 px / 1.6 | Nunito Sans 500 | Answers, composer (16 px avoids iOS zoom on focus) |
| `text-small` | 14 px / 1.5 | Nunito Sans | Buttons, summaries |
| `text-tiny` | 13 px / 1.45 | Nunito Sans | Labels (uppercase + tracking for section labels), hints |

Fonts are self-hosted variable woff2 (OFL) with metric-matched fallbacks and preloaded; there is no
request to Google Fonts. Answer width is capped at `max-w-measure` (42 rem).

**Naming rule:** font-size and colour token names must never collide (`text-body` is a size, the
reading colour is `text-copy`; `text-price` is a size, the price colour is `text-amount`), and every
custom size is registered in `src/shared/ui/cn.ts` so `tailwind-merge` does not drop colours.

## Spacing, radius, elevation, icons

- Spacing: Tailwind's 4 px scale. Transcript gap 24 px between turns, 16 px inside an answer;
  panel gutters 16 px (24 px from `@lg` container width).
- Radius: `sm` 4, `chip` 6, `md` 12 (callouts, disclosures, tables), `lg` 20 (cards, bubbles),
  `xl` 28 (composer), `pill` (every button and chip, as on the storefront).
- Elevation: navy-tinted `shadow-sm` (cards, composer), `shadow-md` (popovers, focused composer,
  floating jump button), `shadow-purchase` (purchase button only).
- Icons: lucide, 20 px in buttons (`[&_svg]:size-5`), 16 px in small buttons and inline labels,
  14 px next to link text; always `aria-hidden`, never the only label.
- Touch targets: ≥ 44 px (`sm` buttons are 44 px tall; header icon buttons 44 px).

## Components (`src/shared/ui`, owned shadcn-style primitives)

| Component | Variants | Notes |
|---|---|---|
| `Button` / `LinkButton` | `action`, `purchase`, `outline`, `ghost`, `chip`, `link` × `sm`, `md`, `icon`, `icon-sm` | CVA; links stay `<a>` |
| `IconButton` | inherits Button | Required `label` = accessible name = visible tooltip on hover **and** keyboard focus |
| `Badge` | `chip`, `quiet`, `notice` | Age range, resource count |
| `Card` / `CardBody` | — | Product card surface |
| `Callout` | `info`, `notice`, `danger` | Status messages; caller chooses `role` |

Feature components (`src/features/assistant/presentation`): `Composer` (auto-grow to 5 lines,
Enter/Shift+Enter, IME-safe, send ↔ stop in the same slot so nothing jumps, counter near the limit),
`RichTextView`, `ProductCard` (vertical in narrow panels, horizontal from a 28 rem card width),
`Comparison` (table when ≥ 2 products), `Sources` (native `<details>` disclosure), `Links`,
`FollowUps` (latest answer only), `Notices`, `OutcomeView` (partial text + reason + retry),
`ClearControl` (non-modal confirmation), `EmptyState`, `Connecting`/`Offline`/`Unavailable`.

## Motion

Tokens: `--ease-out` `cubic-bezier(0.2,0.7,0.2,1)`, 150 ms for state changes, 220 ms `animate-enter`
(opacity + 6 px rise). Rules:

- Only the visitor's newly sent question and transient UI (confirmation, jump button) enter with
  motion; answers never re-animate (the final answer replaces the draft in place), and nothing
  animates per token.
- Streaming indicators: a stepped caret and three pulsing dots — transform/opacity only.
- `prefers-reduced-motion: reduce` collapses all animation and transition durations; the caret stays
  visible and static. These rules are unlayered so they override utilities without `!important`.
- While the host keeps the panel hidden (`data-panel-visible="false"`), all animations pause.
- No 3D, canvas or animation libraries.

## Layout rules

- The embed fills its frame (`h-dvh`, no page scroll); only the transcript scrolls
  (`overscroll-behavior: contain`, `touch-action: pan-y`).
- Layout responds to **container** width (`@container/transcript`, `@container/card`), never to
  the host viewport, so compact, expanded and mobile panels use the same rules.
- The composer sits in a translucent footer with `env(safe-area-inset-bottom)` padding.
- Long words and URLs wrap (`overflow-wrap: anywhere`); tables scroll horizontally in a
  keyboard-focusable region.
