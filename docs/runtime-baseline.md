# Runtime baseline acceptance — 2026-10-17

The owner authorized execution of the shared deployment-readiness plan. This repository owns
its code, tests, image and runtime contract. The private vps-ops inventory owns the shared
baseline/routing/release policy; Coolify remains the sole deployment executor.

| Applicable component | Exact committed lock version |
| --- | --- |
| `next` | `16.4.2` |
| `react` | `19.3.1` |
| `react-dom` | `19.3.1` |
| `better-auth` | `1.7.10` |
| `pg` | `8.23.1` |
| `typescript` | `7.0.2` |
| `@biomejs/biome` | `2.5.15` |
| `@playwright/test` | `1.64.1` |

The lockfile is authoritative for the complete dependency graph. This dated view does not
assert that these versions remain the newest forever or that an image has been published.
Node24.22.0 is LTS; Next16.x is Active LTS. React, TypeScript, authentication libraries and test tools do not acquire LTS status from that choice. Node26 Current/types are excluded. This backoffice uses Trixie builder and digest-pinned nonroot Node24 runtime images with matching24.22.0 interpreters; other applications keep independently verified pins.

## October 2026 framework security update

Next16.4.2 includes the [16.4.1 security fixes](https://github.com/vercel/next.js/releases/tag/v16.4.1)
for Cache Components RCE, image optimization RCE and Server Actions denial of service. This
backoffice uses Server Actions, so authorization checks do not substitute for the framework
patch. React/React DOM19.3.1 align with the patched upstream release; updating those packages
alone would not replace Next's bundled React Server Components implementation. The lock already
contains sharp0.35.5, the documented image-processing workaround. No exploit was attempted.

The earlier framework-only security increment retained Node24.21.0, Playwright1.64.0,
PostgreSQL and the previous image bases; those measurements remain dated history. The separate
fixed17:35UTC maintenance cohort now selects Node24.22.0, Playwright1.64.1 and Better Auth1.7.10.
See [the cohort review](verification/runtime-cohort-2026-10-17.md) for scope and acceptance gates. The application image must be rebuilt from this lock and its
new exact artifact verified before deployment; earlier image IDs and measurements remain
historical evidence. Current-head protected CI checks DB migrations, synthetic OAuth/browser
flows and hardened exact-image smoke/restore. Real OAuth, VPS capacity and actual deployment
remain separate gates.

## Image and operations boundaries

Build dependencies are isolated from the runtime. Frozen installs and dependency-cache mounts
reduce repeated downloads; cache content is not copied into the runtime. Dockerfile frontend
and image bases are digest-pinned. Private registry visibility and immutable release manifests
remain prerequisites for publication and deployment; local image identifiers are not registry
provenance. Images are built in application verification, never rebuilt on the VPS.

The image uses UID/GID65532, exec-form Node probes, no shell/npm/global installer, and read-only root with UID65532-owned tmpfs paths. Migration dependencies remain in the same artifact. Changing old UID1000 cache ownership does not authorize changing persistent database ownership; those data use PostgreSQL UID999 separately.

Databases and writable data stay isolated by project. Secret values are excluded from Git,
images, source build arguments and diagnostics. Runtime credentials are delivered by Coolify;
recovery credentials remain independently available. Existing public websites stay on Business
and their assistant activation remains deferred. No deployment trigger is enabled.

## Verification and remaining gates

Frozen installation, formatting/linting, strict typing, unit/contract and documentation/security/skills checks were run locally. Exact-image smoke verifies nonroot/read-only startup and migration closure. Hosted full quality and browser gates still determine integration acceptance; real OAuth and TLS/cookies through the actual VPS remain unverified.

See [deployment contract](deployment-contract.md) for ports, health, secrets, data and shutdown.
The shared baseline does not promise zero downtime, production capacity or an advisory-free
image. Current unfixed OS findings remain visible; no package is removed or scanner weakened
merely to change a vulnerability count.

## CI privacy boundary

Public-repository CI runs synthetic checks without publishing images, raw diagnostic artifacts
or browser reports. Review results in the bounded redacted job output. Private release artifact
publication needs a separately accepted access/visibility path; passing CI never activates it.
