# Architecture

The private backoffice of the Pequeverso assistant: sign-in, access management and an operations
dashboard. Feature-organized, with dependencies pointing inward; `scripts/check-boundaries.ts`
enforces the layers (part of `npm test`). The public conversation lives only in the storefront.

```
src/
  app/                      routes: composition and metadata only
    ingresar/               sign-in            invitacion/[token]/  invitation landing (route handler)
    panel/                  layout guard + dashboard, accesos/ (owner), cuenta/
    api/auth/[...all]/      Better Auth endpoints       healthz/  liveness
  proxy.ts                  per-request headers (nonce CSP on backoffice routes)
  server/                   server-only composition: config, auth (pool, Better Auth, guards), operations
  features/
    auth/
      domain/access.ts      roles, permissions, e-mail normalization, invitation state, admission route
      application/          use cases (admitSignUp, invite, revoke, remove, resolveActor) + ports
      adapters/             Better Auth config, PostgreSQL store, node crypto
      presentation/         sign-in, invite form, account controls, frame, navigation
    operations/
      domain/summary.ts     ops summary model and pure derivations (money, percentages, freshness)
      application/ports.ts  OpsSource port
      adapters/             HTTP client (server to server) and runtime validation
      presentation/         dashboard (server component), Recharts daily charts (client), formatting
    assistant/, embed/      legacy chat shells (to be removed)
  shared/ui                 owned primitives on the design tokens
migrations/                 committed SQL (Better Auth core + invitations/audit)
```

## Request flow

1. `proxy.ts` sets a per-request nonce CSP, `frame-ancestors 'none'`, no-store and noindex on
   `/panel`, `/ingresar`, `/invitacion` and `/api/auth`.
2. `panel/layout.tsx` calls `requireActor("read_operations")`: the Better Auth session is read
   from PostgreSQL and the role re-read from the user row; anonymous visitors go to `/ingresar`.
3. The dashboard page reads the API's private summary through `server/operations.ts` (bearer
   token from server env), validates it and renders it; failures become "no disponible".
4. Owner mutations are server actions that call `requireActor("manage_access")` again before the
   use case runs.

## Access model

See [ADR 005](adr/005-backoffice-auth-better-auth.md) and [ADR 006](adr/006-iam-in-postgresql.md):
OAuth only, owner by configuration, everyone else by single-use invitation bound to the verified
e-mail, explicit linking only, revocation by deleting the account.

## Operations data

See [ADR 007](adr/007-ops-data-source.md). The contract is pinned in `contracts/ops/` from a
committed API revision (`contracts/ops/source.json`); a unit test checks the pinned hashes and
that the example parses.

## Legacy chat shells

`/` and `/embed` (features `assistant` and `embed`) remain until the storefront's native
assistant reaches verified parity; their design is described in the git history of this file and
in [embed-integration.md](embed-integration.md).
