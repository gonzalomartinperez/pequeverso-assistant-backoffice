# Changelog

## 1.0.0 — source release baseline (2026-10-17)

- Align application and root lockfile version metadata with the owner-selected first source
  release. Dependency versions, application behavior, database migrations and pinned contracts
  are unchanged by this release preparation.
- Strengthen disposable browser fixtures with separate non-owner runtime credentials,
  explicit IAM grants and observed graceful database/role cleanup; production authentication
  code and migrations remain unchanged.
- The baseline includes private OAuth admission and access management, the assistant operations
  dashboard and documented local verification. Full capabilities and limitations remain in
  the README and deployment contract.
- A source version is not evidence of a VPS deployment, production OAuth configuration,
  production security acceptance or assistant activation. Those require their separate gates
  and explicit authorization. No registry publication or deployment is part of this change.
