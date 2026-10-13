# Compact availability dashboard — 2026-10-13

These 26 PNGs capture the actual local production build at runtime source
`e91b15e190dfdd024f780e61886a67925cdf4f77`, with capture checkout `1f732169`.
The checkout differs from the runtime build only in browser-test organization. Desktop
1440×1000 and mobile 390×844 viewports use DPR 2 and actual light/dark browser preference.
All operations values are **static synthetic MOCK examples**, not current process measurements.
Fake OAuth exercises the real Better Auth callback and role guard on disposable PostgreSQL;
these images do not verify external OAuth, OpenAI, a model, private infrastructure or a VPS.

The compact grid shows real product fields without inventing measurements. Unknown values
remain “No disponible”; point-in-time readiness is not provider reachability or uptime.
Token usage is priced with versioned tariffs: the displayed cost is calculated, not a
reconciled invoice. The daily budget explicitly names its historical date. Independent
summary and telemetry mock examples must not be interpreted as one live process history.

Every image is a native browser capture of real DOM bounds: no stitching, PNG retouching,
CSS override or invented widget layout. Mobile overview/focus files show the first viewport.
Daily detail files show the whole section; the second daily table view uses actual horizontal
scrolling. Resource captures open the actual diagnostics and resource disclosures. Keyboard
focus comes from Tab navigation with the actual focus-visible ring checked.

The capture agent and independent root agent inspected every final PNG, including four
Daily recaptures that move the pointer off the chart before capturing so a real tooltip does
not obscure the bars. Original held captures remain outside the public repository. No human
review is claimed. [manifest.json](manifest.json) binds current bytes, dimensions and SHA-256
hashes; [capture-receipt.json](capture-receipt.json) records the initial capture recipe, and
[capture-daily-pointer-corrections-receipt.json](capture-daily-pointer-corrections-receipt.json)
records the four corrected views. The correction process exited 0 in 38.568 s; the initial
outer process exit code was not captured and is not inferred from the PNGs.

Screenshot inspection does not turn the browser suite green. At this capture revision the
complete local suite reports 49 passed, 3 optional LIVE_OPS skips and 2 total-test deadline
failures, with no retries. Continuous 200% text reflow passed at 320, 390, 768 and 1440 CSS px
in Chromium, Firefox, WebKit and mobile Chromium. Final exact-image smoke and full remote CI
remain separate acceptance gates; see [verification.md](../../verification.md).

The [earlier gallery](../availability-2026-10-12/README.md) is a preserved historical baseline,
not a capture of this compact layout. The storefront remains disabled in release preparation.

The legacy [mobile first viewport](../backoffice/mobile-dashboard-top.png) and
[complete mobile daily section](../backoffice/mobile-dashboard-daily.png) were regenerated
by the single owner-dashboard case at test source `7418120d6bacaab825aeade6b77310099a01aba3`,
using the same e91 runtime. Those images use the native Pixel 7 project (412×839, DPR 2.625),
not this gallery's 390×844 setup. The focused case passed; it does not replace the full-suite
deadline failures. The other legacy captures are from the full test source 1f732169.
