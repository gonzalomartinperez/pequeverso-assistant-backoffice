/** Server-only switches: no ambient OTEL variables or secret values in errors. */
export type ObservabilityConfig = {
  metricsToken: string | null;
  otlpEndpoint: string | null;
};

export function observabilitySwitch(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true or false`);
}

export function parseObservability(env: Record<string, string | undefined>): ObservabilityConfig {
  const metrics = observabilitySwitch(
    env.OBSERVABILITY_METRICS_ENABLED,
    "OBSERVABILITY_METRICS_ENABLED",
  );
  const traces = observabilitySwitch(
    env.OBSERVABILITY_TRACES_ENABLED,
    "OBSERVABILITY_TRACES_ENABLED",
  );
  const token = metrics ? (env.OBSERVABILITY_READ_TOKEN?.trim() ?? "") : null;
  if (metrics && (!token || token.length < 32 || token.length > 256 || /\s/.test(token)))
    throw new Error("OBSERVABILITY_READ_TOKEN must be a private token of 32–256 characters");
  if (token && token === env.OPS_READ_TOKEN?.trim())
    throw new Error("OBSERVABILITY_READ_TOKEN must differ from OPS_READ_TOKEN");
  const endpoint = traces ? (env.OBSERVABILITY_OTLP_TRACES_ENDPOINT?.trim() ?? "") : null;
  if (traces) {
    // The official exporter merges ambient OTEL headers even with explicit headers: {}.
    // Refuse that configuration before initialization rather than mutating process-wide env.
    if (Object.keys(env).some((name) => name.startsWith("OTEL_") && Boolean(env[name])))
      throw new Error("Use only OBSERVABILITY_* settings for the isolated trace exporter");
    let url: URL;
    try {
      url = new URL(endpoint ?? "");
    } catch {
      throw new Error("OBSERVABILITY_OTLP_TRACES_ENDPOINT must be an absolute endpoint");
    }
    const privateName =
      url.hostname !== "localhost" && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(url.hostname);
    const local =
      env.BACKOFFICE_ENVIRONMENT !== "production" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/v1/traces" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && (privateName || local)))
    )
      throw new Error(
        "OBSERVABILITY_OTLP_TRACES_ENDPOINT needs https or a private service and /v1/traces",
      );
  }
  return { metricsToken: token, otlpEndpoint: endpoint };
}
