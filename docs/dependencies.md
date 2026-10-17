# Dependency updates and manual integration

Every dependency merge is manual by default. Dependabot continues its configured scheduled
updates (weekly npm/Actions, existing monthly Docker), native rebases and security alerts. The trusted policy only classifies metadata for
review; `decision.automerge` is always false, including lower-risk eligible patches and any
legacy `DEPENDABOT_AUTOMERGE=on` input. Labels, green checks or an eligible assessment are not
merge authority. Future automatic merging requires separate owner authorization and a reviewed
contract/proof; no hidden flag can reactivate it.

## Read-only assessment

The existing allowlists in `scripts/dependabot/policy.ts` classify lower-risk patches/minors
versus elevated review. Authenticated author/commit provenance, same-repository heads,
`develop` target, manifest-only scope and semantic version changes remain required for an
eligible assessment. Framework/runtime/browser-engine updates, majors, ambiguous versions,
lockfile-only changes, forks, human commits and mixed-risk groups remain manual/elevated.
Deterministic tests preserve these cases; an eligible result still has `automerge: false`.

`.github/workflows/dependency-policy.yml` uses trusted default-branch code on
`pull_request_target`; it never checks out, installs or executes PR code. Its token permissions
are only `contents: read` and `pull-requests: read`. The runner performs GET requests for metadata
and manifest data and writes only a job summary. It has no GraphQL/REST mutation, merge,
approval or label writer. If metadata says native auto-merge was already armed, it reports the
condition for an authorized maintainer to disable; a read-only job cannot disarm it.

## Manual integration procedure

1. Review changelog, support policy, direct/transitive scope and application compatibility.
2. Keep required checks and independent review on the exact current head; never use admin,
   bypass, bot approvals or an automatic merge command. Only authorized maintainers integrate.
3. Merge eligible changes into `develop` using a merge commit, this repository's required method.
   Release only `develop` into `main` through the protected release flow.
4. Preserve alerts until the fix reaches `main`. Security PRs target the default branch; retarget
   them to `develop` for normal review rather than merging directly to `main`.
5. Use native `@dependabot rebase` when needed. Keep version updates, cooldowns/grouping,
   security alerts and configured rebase behavior enabled. A hold label is informational;
   it does not grant or revoke repository permissions.

No open Dependabot PRs were reported during the owner-coordinated 2026-10-17 reconciliation.
Repository settings/armed requests must be checked separately by the authorized owner; source
changes only take effect when released to the default branch. Neither this document nor a
successful test claims a remote setting was changed.

## Historical automation assessment — 2026-09-27

The following dated observations describe the former automation profile, which is superseded
by the manual default above. They are not activation instructions or current authorization.

As soon as the configuration reached `main`, Dependabot opened four real pull requests against
`develop`. The policy workflow ran on `pull_request_target` (from the default branch) for each and
correctly withheld auto-merge (label `dependencies:manual-review`):

| PR | Update | Policy reason | Human decision |
|---|---|---|---|
| #8 | `actions/download-artifact` 4.3.0 → 8.0.1 | workflow files changed | full CI green (artifact round trip) → merged |
| #9 | `actions/checkout` 4.4.0 → 7.0.1 | workflow files changed | full CI green → merged |
| #10 | `actions/upload-artifact` 4.6.2 → 7.0.1 | workflow files changed | full CI green → merged |
| #11 | Docker `node` 24.21.0 → 26.10.0 | Dockerfile changed | declined: runtime major outside the Node 24 LTS line; ignore rule added |
| #17 | `actions/setup-node` 4.4.0 → 7.0.0 | workflow files changed | full CI green → merged |

The former positive auto-merge path had only deterministic coverage at that time; it is no longer enabled.


## Runtime support inventory (2026-10-17)

"LTS" is used only where the upstream publishes that policy; a maintained stable library
is not promoted to an invented LTS product. Application/infra owners must periodically
review security advisories, supported versions and exact new artifacts.

| Component | Project revision | Upstream support classification |
|---|---|---|
| Node / npm build tooling | Node 24.22.0, bundled npm11.19.1 | [Node24 LTS](https://nodejs.org/en/about/previous-releases); npm has its own stable releases, not a separate guaranteed LTS window |
| Next.js | 16.4.2 | [16.x Active LTS](https://nextjs.org/support-policy); pinned patch, recheck security updates |
| PostgreSQL image/tools | 18.6-trixie, immutable linux/amd64 manifest in Dockerfile.postgres | [Supported major18 until2030-11-14](https://www.postgresql.org/support/versioning/); current stable minor18.6, not an upstream product called LTS |
| Debian runtime | Debian 13 Trixie slim + exact signed packages | [Official Trixie support](https://www.debian.org/releases/trixie/): full support through 2028-08-09, LTS through 2030-06-30; architecture/package coverage varies. Residual CVEs remain activation decisions |
| React / React DOM |19.3.1 | [Stable React19](https://react.dev/versions); no published separate LTS guarantee |
| Better Auth |1.7.10 | [Stable upstream](https://www.better-auth.com/docs/introduction); pinned and OAuth/schema regression tested, no invented LTS |
| pg |8.23.1 | [Maintained stable](https://node-postgres.com/); no LTS window advertised |
| OpenTelemetry JS |API1.9.1,resources/traceSDK2.12.0,OTLPHTTP0.223.0 | [Official API/SDK signal stability](https://opentelemetry.io/docs/languages/js/); exporter0.x release line is experimental semver, not LTS; manual bounded usage explicitly reviewed |
| TypeScript |7.0.2 | [Stable compiler releases](https://www.typescriptlang.org/docs/); no separate LTS policy |
| Tailwind/PostCSS |4.3.3 | [Stable tooling](https://tailwindcss.com/docs); no separate LTS policy |
| Playwright / axe |1.64.1 /4.13.0 | [Stable Playwright](https://playwright.dev/docs/release-notes) and [axe](https://github.com/dequelabs/axe-core/releases); test-only, no invented LTS |
| Biome |2.5.15 (one compatible patch above the2.5.14 reference; no downgrade) | [Stable formatter/linter](https://biomejs.dev/); test/build-only, no separate LTS |
| lucide / Recharts |1.52.0 /3.10.1 | [Stable icons](https://lucide.dev/) /[charts](https://recharts.github.io/); maintained libraries, no LTS promise |
| Owned primitives |CVA0.7.1,clsx2.1.1,tailwind-merge3.7.0,server-only0.0.1 | Stable exact dependencies reviewed in lockfile; no LTS promise; CVA/server-only0.x need explicit compatibility review |
| Docker / Grafana / Prometheus / collector |Infrastructure selected versions pending | Project does not install or upgrade a shared stack; vps-ops must select official supported versions and validate supplied BO artifacts |

The portfolio frontend at immutable `aed8ea710c8b847ddc9066aaef5ce48d3793b494`
was read via `git show` (AGENTS/CLAUDE/architecture/deployment/Dockerfile); its Next standalone,
exec Node, read-only tmpfs and owned-image separation confirm the same runtime pattern.
No portfolio assets, identity, live working tree or infrastructure configuration were copied.
The BO migration runner uses native Node24 TypeScript stripping and pg; any distroless
candidate must preserve that command, SSR dependencies, uid, health/readiness, PostgreSQL
TLS roots and writable cache bounds. Do not select a smaller base from nominal size alone.
