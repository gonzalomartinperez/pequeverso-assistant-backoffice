---
name: web-change-backoffice
description: "Change backoffice access control, invitations, sessions, the operations dashboard or the pinned ops contract in pequeverso-assistant-web. Not for the API repository, OAuth app setup or deployment."
---

# Change the backoffice

Scope: `src/features/auth`, `src/features/operations`, `src/server`, `src/app/{ingresar,invitacion,panel,api/auth}`,
`migrations/`, `contracts/ops/`.

1. Read [AGENTS.md](../../../AGENTS.md), [architecture](../../../docs/architecture.md) and the
   ADRs on [auth](../../../docs/adr/005-backoffice-auth-better-auth.md),
   [IAM](../../../docs/adr/006-iam-in-postgresql.md) and [ops data](../../../docs/adr/007-ops-data-source.md).
   Check `git status`; preserve others' work.
2. Pick the layer: rules → `features/auth/domain` or `application` (with unit tests in
   `tests/unit/access.test.ts`); persistence → `adapters/postgres-access-store.ts` plus a **new**
   file in `migrations/`; provider/session settings → `adapters/better-auth.ts`; dashboard data →
   `features/operations/{domain,adapters}`; UI → `presentation/` with `src/shared/ui` and tokens.
3. Invariants (never weaken): no passwords or public sign-up; admission only for `OWNER_EMAIL` or a
   single-use invitation bound to the same verified e-mail; no implicit linking; role re-read per
   request; server actions call `requireActor`; secrets only in server env; missing ops values are
   "No disponible", never zero; fixture data is labelled synthetic; no prompts, answers or buyer
   data in the UI.
4. Ops contract change: re-pin `contracts/ops/ops.schema.json` and `ops.summary.example.json` with
   `git show <committed API sha>:<path>`, update `contracts/ops/source.json` (sha and hashes), adapt
   `adapters/validate.ts` and the fixture. Never pin from a working tree.
5. Verify with the [backoffice verification skill](../web-verify-backoffice/SKILL.md).

Not an authorization to merge into `main`, deploy, create OAuth apps, use real credentials or edit
other repositories.
