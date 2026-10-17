# Engineering standards

Pequeverso repositories share review principles and boundary expectations. Each repository keeps
its own language tooling, lockfile, contracts and verification commands. These standards adapt
[Google Engineering Practices](https://google.github.io/eng-practices/review/reviewer/)
and the [Microsoft Engineering Fundamentals Playbook](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/)
to this backoffice; they do not import another language's formatting rules or deployment policy.

## Design and ownership

- Keep dependencies pointing inward: domain rules and application ports stay independent of
  frameworks, persistence and IO. Adapters implement ports; outer server/routes compose them.
- Prefer a small, cohesive change with a concrete outcome. Add abstraction when it isolates a
  real dependency or policy; avoid folder-only rewrites and speculative shared frameworks.
- Validate untrusted data at adapters and pass minimal typed DTOs inward. Recheck authorization
  at the server boundary near the protected operation; hiding controls is not authorization.
- Coordinate contract and lockfile ownership before editing. Consume committed producer pins;
  extend contracts compatibly or document the migration and rollback requirements explicitly.
- Record meaningful architectural decisions in the [architecture](architecture.md) and ADRs.
  Keep application artifacts separate from deployment infrastructure owned by vps-ops.

## Repository checks

| Concern | Backoffice authority |
| --- | --- |
| Formatting and lint | Biome configuration committed in this repository |
| Types | Strict TypeScript 7 configuration and generated route types |
| Boundaries | `scripts/check-boundaries.ts`, real-source check and negative virtual fixtures |
| Dependency reproducibility | `package-lock.json`, `.nvmrc`, `npm ci`, pinned container artifacts |
| Verification | `npm run check`, `npm run test:db`, `npm run test:browser` |
| Safety and docs | Public-file scan, committed contracts, documentation and skills checks |

Negative boundary fixtures must demonstrate rejected dependencies as well as legitimate
composition. Tests use disposable local services and synthetic identities/data; they never alter
shared databases or require real OAuth credentials. Preserve initial failing evidence and add a
regression before accepting a defect correction. Do not add retries, sleeps or relaxed checks to
hide a race. For disposable database cleanup, close all owned sockets before dropping the database.

## Review and delivery

PRs explain the problem, resulting behavior, validation and remaining limits. Review correctness,
security, complexity, naming, tests and documentation; separate blocking defects from optional
style preferences. Require independent review for meaningful changes and current-head required
CI. Never bypass protections or weaken a gate to obtain a green result.

Task branches target `develop`; this repository uses merge commits. Releases to `main` follow
the owner-authorized release flow. A skill documents a procedure, not permission to merge,
deploy or access secrets. Do not publish credentials, private identities, session artifacts or
provider payloads in logs, screenshots or documentation.

Support labels must match the vendor's published policy. Prefer supported stable lines and lock
exact versions/digests, but do not call every dependency LTS or force identical tool versions
across repositories. Review compatibility, changelog, installation and required checks before
adopting upgrades; avoid unrelated dependency changes in feature or architecture PRs.

A green fixture suite proves only its exercised controls. Report real provider, OAuth, VPS,
restore and availability checks separately from local/synthetic evidence; never claim production
readiness from a build or screenshot alone.
