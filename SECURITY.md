# Security

Report vulnerabilities privately to the repository owner (GitHub private vulnerability reporting
or the Pequeverso support address listed on the storefront). Do not open public issues.

This repository is public; the application it builds is a **private** backoffice. Design notes:

- **Access:** OAuth (Google, GitHub) through Better Auth. No passwords, no public sign-up, no
  domain-based access. Only `OWNER_EMAIL` and invited, provider-verified e-mails get an account;
  invitations are single-use, expire after 48 h and are stored as SHA-256 digests. Roles
  (`owner`, `viewer`) are re-read on every request; removing an account deletes its sessions.
  See [authentication.md](docs/authentication.md).
- **Sessions:** server-side in PostgreSQL; HttpOnly, SameSite=Lax, host-only cookies (`Secure` on
  https). Nothing about sessions or credentials is stored in `localStorage`. Origin checks protect
  state-changing auth requests; server actions are Origin-checked by Next.js and re-check the role.
- **Headers:** backoffice routes send a nonce-based CSP (`strict-dynamic`, no `unsafe-inline`
  scripts), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cache-Control: private, no-store`
  and `X-Robots-Tag: noindex`.
- **Operations data:** read server-to-server with `OPS_READ_TOKEN` (server environment only, never
  `NEXT_PUBLIC_*`), validated at runtime, never cached; it contains aggregates only (no prompts,
  answers, buyer e-mails, cookies or secrets).
- **Secrets:** only in the runtime environment (`BETTER_AUTH_SECRET`, `DATABASE_URL`, provider
  client secrets, `OPS_READ_TOKEN`). Production refuses weak or test settings
  (`src/server/parse-config.ts`). CI scans files and history for secrets.
- **Legacy chat** (`/`, `/embed`), until removed: the browser holds no API keys, answer text is
  rendered as React text nodes only, links pass an allowlist, postMessage is origin-checked.
- No analytics, session replay or third-party scripts are loaded.
