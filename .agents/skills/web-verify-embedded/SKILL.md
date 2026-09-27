---
name: web-verify-embedded
description: "Verify pequeverso-assistant-web end to end: checks, unit and browser suites, and real screenshots of the embedded panel inside the cross-origin storefront harness at compact, expanded and mobile sizes plus the standalone page. Not for writing features."
---

# Verify the experience

1. `nvm use && npm ci` (first time: `npx playwright install --with-deps chromium firefox webkit`).
2. `npm run check` — Biome, TypeScript 7 typecheck (route types included), contract snapshot,
   unit tests (reducer, controller, SSE against the API's own examples, protocol, URL policy,
   boundaries), public-file scan, docs links, skills, production build.
3. `npm run test:browser` — all projects. Ports 3207/3208/3210/8207 must be free.
4. Look at the screenshots under `test-results/` (or run with `SCREENSHOTS=1` to refresh
   `docs/verification/screenshots/`). Judge the **embedded** captures first: spacing, clipping,
   contrast, icon alignment, focus rings, streaming and failure states, both themes.
5. Manual pass: `npm run build && npm run preview:fixture`, open http://localhost:3210, and exercise
   keyboard-only use, Escape, minimize/reopen during streaming, expand/restore, the harness abuse
   buttons and a narrow mobile viewport. Screen-reader and real-device checks are recorded
   separately; automated scans are not proof of accessibility.
6. Record results in [verification.md](../../../docs/verification.md) — measured facts separate
   from visual judgment.

This skill does not authorize publishing images, deploying or changing other repositories.
