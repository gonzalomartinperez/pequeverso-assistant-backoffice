# Availability and observability

The authenticated dashboard answers operator questions using the private API summary1.2 and,
when enabled, the independently pinned telemetry1.0 contract. Business spend and run history
remain in the summary; process counters are not a financial ledger. Missing readings are
**No disponible**, never zero. A process uptime duration is not an availability percentage.
Provider readiness cannot be inferred from API readiness or a synthetic provider. Real
API resource/HTTP measurements describe that process even with a fixture model. The local
mock serves a committed example with preview timestamps refreshed once at startup: its values
are demonstration data, not live process measurements. The catalog verification timestamp
therefore remains consistent with the example's verified-price verdict without changing the
pinned artifact. Screenshot/test reports must retain that provenance. Fixtures
remain prominently labelled; no provider probe or paid call is performed by the dashboard.

## Backoffice signals

The application owns a private, optional `GET /internal/v1/ops/metrics` scrape endpoint.
It is off by default (404); enabled requests need a separate server-only bearer credential
(401 when absent/wrong), compared with constant-time byte comparison for equal-length tokens.
This credential must differ from the API's `OPS_READ_TOKEN`. Human pages continue to require
Better Auth and per-request server-side roles; a scrape credential grants no human access.
Never route this endpoint publicly or put its token in client variables, URLs or logs.

| Server-only switch | Default / bounds |
|---|---|
| `OBSERVABILITY_METRICS_ENABLED` | false; true enables private Prometheus text format |
| `OBSERVABILITY_READ_TOKEN` | Separate 32–256-character bearer secret, no whitespace |
| `OBSERVABILITY_TRACES_ENABLED` | false; true enables manual OTLP HTTP JSON spans |
| `OBSERVABILITY_OTLP_TRACES_ENDPOINT` | Required only for traces; HTTPS or private single-label service, exact `/v1/traces`, no credentials/query/fragment; loopback only outside production |
| `OPS_TELEMETRY_ENABLED` | false; optional API telemetry read, same private API bearer |

Only fixed operations `ops_summary`, `ops_telemetry`, `readiness` and outcomes `ok`,
`unavailable`, `error` become labels. Counters and latency histograms begin with this process;
restarts reset them. RSS means this process only, not container/host usage. Do not compare
process RSS directly to a shared container total or invent a quota when none is reported.

The official OpenTelemetry JS API/trace SDK and OTLP exporter are pinned in the lockfile.
The exporter/resource/trace SDK modules load only when traces are opted in, so the default
and metrics-only modes avoid that initialization overhead. An isolated `BasicTracerProvider` is deliberately **not registered globally**: Next's default
HTTP/fetch/route spans can contain private URLs and invitation paths. No HTTP, SQL, OAuth or
browser auto-instrumentation, incoming browser trace propagation, resource detectors, exception text,
headers, bodies, user identifiers, invitation tokens or raw URLs are collected. Manual spans
carry only the fixed operation name, outcome and `service.name=pequeverso-backoffice`.
The server may forward its newly created W3C traceparent to the authenticated private API
summary/telemetry read. It never trusts a browser-supplied parent, forwards baggage/tracestate,
or exposes that header to the browser. The API must validate both the private bearer and
the pinned trace-context policy before correlating it.

The official exporter merges ambient OTEL headers even with an explicit empty header object.
When traces are enabled, any nonempty `OTEL_*` environment setting therefore fails startup
with a generic error. Use this application's reviewed `OBSERVABILITY_*` settings, not ambient
SDK/resource/header configuration. No process-wide environment values are modified.

Trace queue128, batch16, interval5s, export timeout2s, processor deadline2.5s and one concurrent
export bound overhead. The pinned official HTTP transport caps collector response bodies at
4 MiB; only sanitized batch result codes reach the processor, never raw collector errors. Request handlers never await an export. Collector outage must not
turn a successful business read into a failure. There is no guarantee of final trace delivery
at shutdown or when the bounded queue fills. No global diagnostic logger is enabled.

## Infrastructure handoff

vps-ops owns the actual collector, Prometheus/Grafana versions, network, credentials, storage,
retention, alert receiver and deployment. This repository supplies signal names and proposed
BO-only dashboards/rules; it does not provision a shared stack. Keep scrape/collector ports
private and use a mounted private authorization file, never a literal credential in tracked
configuration. Disable collector request-body/debug logging. Bound retention, cardinality,
RAM/disk and retries in that stack separately. A panel showing one current observation is not
an SLO, a burn rate or a production availability guarantee.

Official references: [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/instrumentation/),
[Next instrumentation](https://nextjs.org/docs/app/guides/open-telemetry),
[Prometheus exposition](https://prometheus.io/docs/instrumenting/exposition_formats/).

BO-only reference artifacts: [Grafana dashboard](../observability/backoffice-dashboard.json)
and [Prometheus alert proposals](../observability/backoffice-alerts.yml). They reference the
private job `pequeverso-backoffice`; configure its target and authorization file separately.
Grafana receives only safe aggregate Prometheus series, not IAM/conversation data. A scrape
failure can mean disabled telemetry, credential/network problems or a process outage; it is
not a provider verdict. Failure-rate alerts require at least five actual dashboard reads.
No traffic does not imply successful service. RSS does not include the shared cgroup total;
use infrastructure container metrics for actual quota/headroom alerts. Validate/import the
artifacts against the chosen stable/supported stack and deliver a real alert in staging
before treating them as operational monitoring.
