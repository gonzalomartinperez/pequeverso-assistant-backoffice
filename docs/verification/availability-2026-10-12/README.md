# Dashboard screenshot provenance — 2026-10-12

All 26 PNGs are native browser captures of the rendered local application. Production build
runtime source: `11f13a5ef770d5197eb134ccfa5c628eca24814c`; capture checkout:
`5515732` (AGENTS-only documentation delta). Desktop 1440×1000, mobile 390×844, DPR 2;
light/dark follow actual browser color preference. Section images capture their real DOM
bounds; there is no compositing, image retouching or fabricated widget layout.

The local mock ops server supplies static synthetic aggregate values with coherent sample
verification timestamps. Fake OAuth exercises the real Better Auth callback and role guard;
Google/GitHub OAuth and VPS deployment are not verified by these images. No provider keys,
private headers, prompts, answers, customer data or production operation records appear.
Costs are fixture calculations from reported tokens and versioned tariffs, not invoice totals.
Unknown telemetry values stay unknown; point-in-time readiness does not establish uptime or
provider availability. Historical rows are dated; omitted days are not zero.

The capture and independent root agents inspected every image; no human approval is claimed.
Four initial mobile framing/focus captures were held and recaptured, with originals retained
outside the public repository. Mobile overview/focus files show only the first viewport.
Daily/resource detail files show complete sections. The two right-scrolled daily views are
actual `scrollLeft=670`, `clientWidth=314`, `scrollWidth=984` states. Navigation focus came from
real Tab navigation, with activeElement, :focus-visible and a visible 3px solid outline checked.

[capture-receipt.json](capture-receipt.json) records the initial 24-view recipe;
[capture-mobile-corrections-receipt.json](capture-mobile-corrections-receipt.json) records the
six final corrected/added mobile views. [manifest.json](manifest.json) binds all final image
bytes and dimensions. Local browser verification separately records 40 passed, 1 Firefox
invitation-lifecycle 45s timeout and 3 optional LIVE_OPS skips in 521.88s; these screenshots do
not turn that run green. Actual image OAuth, private bearer, shared route/RSC counters and
cross-service JSON/protobuf OTLP/W3C correlation passed separately with fixture model and
zero model requests. Production acceptance and CI remain separate gates.
