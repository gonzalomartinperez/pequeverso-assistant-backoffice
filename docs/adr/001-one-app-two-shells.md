# ADR 001 — One conversation implementation, two shells

**Status:** accepted (2026-09-27)

**Context.** The storefront will host the assistant in its own launcher panel; the owner also needs
a standalone page for demos and testing. Duplicating transport or state would let the two drift.

**Decision.** A single feature (`src/features/assistant`) owns domain, application, adapters and
presentation. `/embed` (primary) and `/` (secondary) are thin shells that add only a header and the
outer layout; the embed shell adds the host bridge. The storefront owns launcher, panel and sizing;
this app owns everything inside the frame.

**Consequences.** Every UI change must be verified at embedded panel sizes; container queries replace
viewport breakpoints inside the frame. The standalone page has no panel controls or diagnostics.
