---
name: web-review-delivery
description: "Review a pequeverso-assistant-backoffice change or prepare its pull request into develop: scope, security, accessibility, contracts, docs and verification evidence. Not for merging into main or deploying."
---

# Review and deliver

1. Review the diff against `develop` and read the auth, IAM and ops-data ADRs. Flag admission
   without a verified e-mail or presented invitation, implicit account linking, missing server-side
   role checks, mutations without transactional owner re-checks, secrets or sessions exposed to the
   browser or logs, unvalidated ops payloads, and public access to private pages.
2. Confirm `npm run check`, `npm run test:db` and `npm run test:browser` evidence. For UI changes,
   inspect desktop, dark and mobile screenshots in `docs/verification/backoffice/`; check keyboard
   use, focus restoration, overflow, contrast and reduced motion. Missing values must remain
   "No disponible" and fixtures must be visibly synthetic. Require reproducible evidence for
   defects; separate blockers from suggestions.
3. Keep architecture, authentication, design system, deployment contract, pinned ops contract and
   coordination docs accurate. Changes to migrations are append-only; contracts come only from an
   identified committed API revision. Do not render prompts, answers or buyer data in the dashboard.
4. Dependency PRs: follow [dependencies.md](../../../docs/dependencies.md). The policy decides
   auto-merge; never approve, merge or re-label a PR to get around it, and treat security updates
   against `main` by re-targeting them to `develop`.
5. Branch flow is a working agreement: task branches into `develop`, only `develop` into `main`,
   and a `hotfix/*` into `main` **only with the owner's explicit authorization**, followed by merging
   `main` back into `develop`.
6. Open the PR against `develop` with a Conventional Commit title, verification notes and the
   attribution footer required by the session. Never push to `main`, merge a release, or deploy
   without explicit owner authorization.

## Limits

Review and PR preparation only: never push to `main`, merge a release, deploy, bypass rulesets
or approve on the author's behalf without the owner's explicit authorization for that action.
