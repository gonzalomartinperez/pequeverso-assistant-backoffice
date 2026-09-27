# ADR 002 — TypeScript 7 as the only type checker

**Status:** accepted (2026-09-27)

**Context.** TypeScript 7.0.2 (native compiler) is stable but ships no JavaScript compiler API.
Next.js 16.3.6 documents TypeScript 7 support: `next build` runs the project-local `tsc` CLI by
default (`experimental.useTypeScriptCli`, on by default), after generating route types.

**Decision.** `typescript@7.0.2` is the only TypeScript installed. `npm run typecheck` =
`next typegen && tsc --noEmit` over the whole project (tests included); `next build` runs the same CLI.
Strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`,
`noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. `ignoreBuildErrors` is never
used. Unit tests run `.ts` directly with Node 24's type stripping (no compiler). The boundary
checker scans imports itself instead of using the TypeScript API.

**Consequences.** The TypeScript language-service plugin `next` in `tsconfig.json` is ignored by the
TS 7 language server (editor hints for Next-specific props are unavailable); command-line checking
is unaffected. Measured before/after timings are in [verification.md](../verification.md).
