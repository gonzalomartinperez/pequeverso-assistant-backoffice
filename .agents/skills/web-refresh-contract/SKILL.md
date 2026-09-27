---
name: web-refresh-contract
description: "Refresh the pinned pequeverso-assistant-api contract snapshot in contracts/api from a reviewed API revision and adapt validators, mock and docs. Not for UI changes or for editing the API repository."
---

# Refresh the API contract

1. Read [api-contract.md](../../../docs/api-contract.md). Inspect the API repository **read-only**;
   prefer a committed, reviewed revision. Never edit its working tree.
2. Copy `contracts/openapi.json`, `sse.schema.json`, `manifest.json` and `examples/` into
   `contracts/api/`; update `contracts/source.json` (commit, manifest SHA-256, date, status).
3. `npm run contract:check`, then `npm test`: the SSE and session examples run through the real
   adapters. Update `adapters/validate.ts`, `adapters/sse.ts`, domain models, the mock
   (`scripts/mock-api.ts`, `scripts/fixtures.ts`) and copy for any change. Do not invent fields.
4. Record the inspected revision and decisions in [coordination.md](../../../docs/coordination.md).
5. Verify with the [verification skill](../web-verify-embedded/SKILL.md) and open a PR into `develop`.
