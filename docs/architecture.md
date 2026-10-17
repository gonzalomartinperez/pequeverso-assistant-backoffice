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

The former public chat shells (`/`, `/embed`) were removed once the storefront's native
assistant reached parity; their design remains in the git history.


## Optional operational observability

The private API telemetry endpoint1.0 is independent from summary1.2 and the public chat contract.
The dashboard consumes only committed pinned schemas; telemetry is disabled by default
and a missing/disabled/malformed reading never invalidates a valid legacy summary.
Readiness is a point-in-time observation, provider status can be unknown, counters begin
at process start, and null values never become zero.

The BO's isolated manual OpenTelemetry provider never registers globally, so Next's
automatic route/fetch spans cannot leak private URLs or invite tokens. An optional private
metrics endpoint requires a distinct machine bearer; protected human pages still recheck
Better Auth roles. See [observability](observability.md) for switches, bounds, privacy and
BO-only Prometheus/Grafana proposals. Infrastructure deployment remains owned by vps-ops.

## Enforced dependency boundaries

Domain and application modules contain rules and injected ports, with no browser, network,
process or timer globals. Adapters implement IO; `src/server` composes adapters and use cases;
`src/app` remains the route/composition boundary. Presentation can depend on its own domain,
shared UI and explicit `import type` / `export type` declarations from its own application.
Runtime application imports, re-exports and dynamic imports from presentation are rejected.
Keep use-case execution in the outer server/action composition.

Every module under `src/features/<feature>/` must use a recognized `domain`, `application`,
`adapters` or `presentation` directory. Unknown placement cannot opt out of layer checks.
Outer framework entry points such as `src/proxy.ts` and `src/instrumentation.ts` retain their
composition role; they do not make misplaced feature modules valid.

`npm test` runs the checker over real source and negative virtual-module fixtures for these
rules, alongside positive composition and type-only cases. The checker uses a bounded textual
scanner rather than a complete TypeScript parser (TypeScript 7 does not expose that API).
It is a regression guard for declared dependencies, not a sandbox or a proof of semantic purity;
review indirect IO, computed imports and new syntax explicitly. No runtime authorization or
framework isolation depends on this scanner.
