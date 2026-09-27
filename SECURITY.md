# Security

Report vulnerabilities privately to the repository owner (GitHub private vulnerability reporting
or the Pequeverso support address listed on the storefront). Do not open public issues.

Scope and design notes:
- The browser holds no API keys. The API session is an HttpOnly cookie issued by the API; the CSRF
  token is kept in memory only.
- `/embed` may be framed only by origins in `EMBED_ALLOWED_ORIGINS`; all other routes refuse framing.
- postMessage traffic is validated by exact origin, expected source window, version and shape, and
  never carries credentials or conversation content.
- Answer text is rendered as React text nodes only; links and product actions pass an allowlist.
- No analytics or third-party scripts are loaded.
