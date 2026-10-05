/**
 * Runs once when the server starts (not during `next build`). Validates the configuration so a
 * production container with a missing secret, owner or provider fails at startup instead of on
 * the first request, and warns once when client IPs cannot be attributed behind the proxy.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { config } = await import("./server/config");
  let settings: ReturnType<typeof config>;
  try {
    settings = config();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "configuration_invalid",
        message: error instanceof Error ? error.message : "invalid configuration",
      }),
    );
    process.exit(1);
  }
  if (settings.environment === "production" && settings.trustedProxies.length === 0)
    console.warn(
      JSON.stringify({
        event: "rate_limit_client_ip_untrusted",
        message:
          "TRUSTED_PROXY_IPS is empty: X-Forwarded-For chains are not trusted, so per-IP sign-in limits may group clients. Set it to the reverse proxy address.",
      }),
    );
}
