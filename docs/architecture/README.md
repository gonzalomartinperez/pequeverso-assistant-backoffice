# Backoffice architecture diagrams

The README uses authored native SVGs with Pequeverso colors, aligned components and explicit
application boundaries. They contain local text and shapes: no scripts, HTML foreignObject,
remote resources, fonts or runtime dependencies. The Mermaid files preserve the semantic
relationships and can be edited independently; they do not generate the same pixel layout.

The owner or invited operators authenticate through Better Auth OAuth. Server-side session
and role checks use the backoffice’s separate PostgreSQL identity database. The dashboard reads
validated aggregate summaries and optional telemetry through a bounded server-only adapter;
provider credentials, prompts, answers and buyer data are not dashboard content. Optional OTLP
and metrics complement that UI. Prometheus, Grafana and deployment remain operator-owned;
this repository does not deploy a monitoring stack.

Solid arrows identify explicit visitor paths or guarded application/storage access. Dashed arrows
identify disabled or optional integration; the labels distinguish them. A dashed box marks
operator-owned future/optional infrastructure. Neither theme proves deployment, VPS capacity,
security approval, production metrics or measured conversion.

Open the [light SVG](system-light.svg) or [dark SVG](system-dark.svg) at full size for detail.
At 390 px the image is an overview; use the adjacent README prose and image alt text rather than
relying on tiny labels. Sources: [light Mermaid](system-light.mmd), [dark Mermaid](system-dark.mmd).
The [manifest](manifest.json) records committed source references, asset hashes and review status.

Validation uses local Playwright 1.64.1 / Chromium 156.0.8078.4: native 1040 px, README 896 px and
mobile 390 px previews, without network requests. XML safety, text bounds and palette contrast
are checked separately. This is a browser render of authored SVG, not a Mermaid-generated
presentation or a GitHub-native preview. Earlier generated diagrams remain in Git history.
