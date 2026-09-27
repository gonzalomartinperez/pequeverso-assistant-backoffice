---
name: web-change-assistant
description: "Implement or refactor assistant UI, conversation state, transport or embed behavior in pequeverso-assistant-web within its feature boundaries and design system. Not for refreshing the API snapshot, deployment or storefront changes."
---

# Change the assistant

1. Read [AGENTS.md](../../../AGENTS.md), [architecture](../../../docs/architecture.md) and, for UI,
   the [design system](../../../docs/design-system.md). Check `git status` and preserve others' work.
2. Branch from `develop` (`feat/…`, `fix/…`). Decide the layer first:
   - state rules → `src/features/assistant/domain/conversation.ts` (pure reducer) + unit test;
   - orchestration → `application/assistant.ts`; wire formats → `adapters/` (validate everything);
   - UI → `presentation/` using `src/shared/ui` primitives and semantic tokens only;
   - host coordination → `src/features/embed/protocol.ts` + `contracts/embed.v1.*` + docs.
3. Embedded first: every UI change must work in the compact (400 px), expanded (760 px) and mobile
   panels. Use container queries, not viewport breakpoints, inside the frame.
4. Keep the rules: no invented prices/claims, no HTML rendering path, URLs through
   `domain/links.ts`, no credentials or text in postMessage, no tracking.
5. Verify with the [verification skill](../web-verify-embedded/SKILL.md), then open a PR into
   `develop` using the [review skill](../web-review-delivery/SKILL.md).

This skill does not authorize merging into `main`, deploying, paid model calls or editing other
repositories.
