# ADR 007 — Operational data comes from the API's private summary endpoint

**Status:** accepted (2026-10-05)

**Context.** The dashboard needs health, catalog freshness, run outcomes, latency, token usage and
spend. The API already keeps a spend ledger and content-free run metrics; Prometheus/Grafana would
duplicate them without adding the spend semantics (confirmed / estimated / pending).

**Decision.** The backoffice reads `GET {OPS_API_URL}/internal/v1/ops/summary` server-to-server
with a bearer token (`OPS_READ_TOKEN`), per request, never cached, 4 s timeout, no redirects,
256 KiB cap, validated at runtime against the contract pinned in `contracts/ops/` from a
committed API revision. The endpoint is not routed publicly; the browser never sees the token or
the URL. Missing values render as "no disponible"; a failed read renders a single unavailable
notice. Data from the fixture provider is labelled synthetic. A trend chart (Recharts 3.10) is
drawn only with two or more days of records; the accessible table is always present.

**Consequences.** History is limited to what the API retains (its run metrics keep 90 days; the
dashboard shows the last 30 days). No metrics endpoint is exposed to browsers, no external
observability service is enabled, and the collector cannot affect answering: if the API cannot
summarise, the backoffice says so and buyers are unaffected.
