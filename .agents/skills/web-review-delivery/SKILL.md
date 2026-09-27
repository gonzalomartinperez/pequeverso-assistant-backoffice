---
name: web-review-delivery
description: "Review a pequeverso-assistant-web change or prepare its pull request into develop: scope, security, accessibility, contracts, docs and verification evidence. Not for merging into main or deploying."
---

# Review and deliver

1. Diff against `develop`. Flag: invented commerce claims; HTML rendering of answers; URLs that
   bypass `domain/links.ts`; postMessage with `"*"` or with content/credentials; storage of
   conversation data; new third-party scripts; viewport breakpoints inside the embed; motion
   without a reduced-motion path; hover-only information; unvalidated payloads.
2. Confirm `npm run check` and `npm run test:browser` evidence, with embedded screenshots at panel
   sizes for UI changes. Require reproducible evidence for defects; separate blockers from
   suggestions.
3. Docs: architecture, design system, embed integration, deployment contract, API contract and
   coordination stay accurate for what changed.
4. Dependency PRs: follow [dependencies.md](../../../docs/dependencies.md). The policy decides
   auto-merge; never approve, merge or re-label a PR to get around it, and treat security updates
   against `main` by re-targeting them to `develop`.
5. Branch flow is a working agreement: task branches into `develop`, only `develop` into `main`,
   and a `hotfix/*` into `main` **only with the owner's explicit authorization**, followed by merging
   `main` back into `develop`.
6. Open the PR against `develop` with a Conventional Commit title, verification notes and the
   attribution footer required by the session. Never push to `main`, merge a release, or deploy
   without explicit owner authorization.
