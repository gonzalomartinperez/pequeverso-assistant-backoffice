import { timingSafeEqual } from "node:crypto";
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, type Tracer } from "@opentelemetry/api";
import type { BasicTracerProvider, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { ObservabilityConfig } from "./observability-config.ts";

/** Only these operations/outcomes can become labels. Never URLs, auth routes or errors. */
export type SafeOperation = "ops_summary" | "ops_telemetry" | "readiness";
type Outcome = "ok" | "unavailable" | "error";
const OPERATIONS: SafeOperation[] = ["ops_summary", "ops_telemetry", "readiness"];
const OUTCOMES: Outcome[] = ["ok", "unavailable", "error"];
const BOUNDS = [0.05, 0.2, 1, 4, 10];

export class SafeObservability {
  private tracer: Tracer | null = null;
  private provider: BasicTracerProvider | null = null;
  private counts = new Map<string, number>();
  private durations = new Map<SafeOperation, { count: number; sum: number; buckets: number[] }>();
  private started = Date.now() / 1000 - process.uptime();
  private exportSuccesses = 0;
  private exportFailures = 0;

  private settings: ObservabilityConfig;

  private initialization: Promise<void> | null = null;

  constructor(settings: ObservabilityConfig) {
    this.settings = settings;
  }

  /** Load exporter SDK only when opted in; no SDK/network setup in the default mode. */
  initialize(): Promise<void> {
    this.initialization ??= this.initializeTraces();
    return this.initialization;
  }

  private async initializeTraces(): Promise<void> {
    const endpoint = this.settings.otlpEndpoint;
    if (endpoint) {
      const [
        { OTLPTraceExporter },
        { resourceFromAttributes },
        { BasicTracerProvider, BatchSpanProcessor },
      ] = await Promise.all([
        import("@opentelemetry/exporter-trace-otlp-http"),
        import("@opentelemetry/resources"),
        import("@opentelemetry/sdk-trace-base"),
      ]);
      // Intentionally NOT registered globally: Next's default spans contain URL/auth metadata.
      // No resource detectors, HTTP/SQL auto-instrumentation, propagation or ambient headers.
      const exporter = new OTLPTraceExporter({
        url: endpoint,
        headers: {},
        timeoutMillis: 2000,
        concurrencyLimit: 1,
      });
      const safeExporter: SpanExporter = {
        export: (spans, callback) =>
          exporter.export(spans, (result) => {
            if (result.code === 0) this.exportSuccesses++;
            else this.exportFailures++;
            callback({ code: result.code });
          }),
        shutdown: () => exporter.shutdown().catch(() => undefined),
      };
      this.provider = new BasicTracerProvider({
        resource: resourceFromAttributes({ "service.name": "pequeverso-backoffice" }),
        spanProcessors: [
          new BatchSpanProcessor(safeExporter, {
            maxQueueSize: 128,
            maxExportBatchSize: 16,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 2500,
          }),
        ],
      });
      this.tracer = this.provider.getTracer("pequeverso.safe-operations", "1.0");
    }
  }

  authorize(header: string | null): "disabled" | "rejected" | "allowed" {
    const token = this.settings.metricsToken;
    if (!token) return "disabled";
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(header ?? "");
    return actual.length === expected.length && timingSafeEqual(actual, expected)
      ? "allowed"
      : "rejected";
  }

  async observe<T>(
    operation: SafeOperation,
    read: (traceparent: string | null) => Promise<T>,
    classify: (value: T) => Outcome,
  ): Promise<T> {
    if (!OPERATIONS.includes(operation)) return read(null);
    await this.initialize();
    const started = performance.now();
    const span = this.tracer?.startSpan(
      operation,
      { kind: operation === "readiness" ? SpanKind.INTERNAL : SpanKind.CLIENT },
      ROOT_CONTEXT,
    );
    let outcome: Outcome = "error";
    try {
      const context = span?.spanContext();
      const traceparent = context
        ? `00-${context.traceId}-${context.spanId}-${context.traceFlags.toString(16).padStart(2, "0")}`
        : null;
      const result = await read(traceparent);
      const observed = classify(result);
      outcome = OUTCOMES.includes(observed) ? observed : "error";
      return result;
    } finally {
      const seconds = Math.max(0, (performance.now() - started) / 1000);
      const key = `${operation}:${outcome}`;
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
      const value = this.durations.get(operation) ?? {
        count: 0,
        sum: 0,
        buckets: BOUNDS.map(() => 0),
      };
      value.count++;
      value.sum += seconds;
      BOUNDS.forEach((bound, index) => {
        if (seconds <= bound) value.buckets[index] = (value.buckets[index] ?? 0) + 1;
      });
      this.durations.set(operation, value);
      span?.setAttribute("operation.outcome", outcome);
      span?.setStatus({ code: outcome === "ok" ? SpanStatusCode.OK : SpanStatusCode.ERROR });
      span?.end();
    }
  }

  metrics(): string {
    const lines = [
      "# HELP pequeverso_backoffice_operation_total Server operation outcomes since process start.",
      "# TYPE pequeverso_backoffice_operation_total counter",
    ];
    for (const operation of OPERATIONS)
      for (const outcome of OUTCOMES)
        lines.push(
          `pequeverso_backoffice_operation_total{operation="${operation}",outcome="${outcome}"} ${this.counts.get(`${operation}:${outcome}`) ?? 0}`,
        );
    lines.push(
      "# HELP pequeverso_backoffice_operation_duration_seconds Server operation latency since process start.",
      "# TYPE pequeverso_backoffice_operation_duration_seconds histogram",
    );
    for (const operation of OPERATIONS) {
      const value = this.durations.get(operation);
      BOUNDS.forEach((bound, index) => {
        lines.push(
          `pequeverso_backoffice_operation_duration_seconds_bucket{operation="${operation}",le="${bound}"} ${value?.buckets[index] ?? 0}`,
        );
      });
      lines.push(
        `pequeverso_backoffice_operation_duration_seconds_bucket{operation="${operation}",le="+Inf"} ${value?.count ?? 0}`,
        `pequeverso_backoffice_operation_duration_seconds_count{operation="${operation}"} ${value?.count ?? 0}`,
        `pequeverso_backoffice_operation_duration_seconds_sum{operation="${operation}"} ${value?.sum ?? 0}`,
      );
    }
    lines.push(
      "# HELP pequeverso_backoffice_trace_export_total Completed OTLP batch exports, not delivered spans or queue drops.",
      "# TYPE pequeverso_backoffice_trace_export_total counter",
      `pequeverso_backoffice_trace_export_total{outcome="ok"} ${this.exportSuccesses}`,
      `pequeverso_backoffice_trace_export_total{outcome="error"} ${this.exportFailures}`,
      "# HELP pequeverso_backoffice_trace_export_enabled Whether manual OTLP export is configured, not collector availability.",
      "# TYPE pequeverso_backoffice_trace_export_enabled gauge",
      `pequeverso_backoffice_trace_export_enabled ${this.settings.otlpEndpoint ? 1 : 0}`,
      "# HELP pequeverso_backoffice_process_resident_memory_bytes Current process RSS, not container usage.",
      "# TYPE pequeverso_backoffice_process_resident_memory_bytes gauge",
      `pequeverso_backoffice_process_resident_memory_bytes ${process.memoryUsage().rss}`,
      "# HELP pequeverso_backoffice_process_start_time_seconds Estimated process start Unix timestamp.",
      "# TYPE pequeverso_backoffice_process_start_time_seconds gauge",
      `pequeverso_backoffice_process_start_time_seconds ${this.started}`,
    );
    return `${lines.join("\n")}\n`;
  }

  /** Local test/one-shot drain; request handlers never wait for an exporter. */
  async shutdown(): Promise<void> {
    await this.initialize();
    await this.provider?.shutdown().catch(() => undefined);
  }
}

let singleton: SafeObservability | undefined;
export function observability(settings: ObservabilityConfig): SafeObservability {
  singleton ??= new SafeObservability(settings);
  return singleton;
}
