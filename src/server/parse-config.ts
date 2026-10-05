import { assertDisposableDatabase, isLoopbackUrl } from "./fixture-safety.ts";

/**
 * Backoffice runtime configuration, read on the server only (never inlined into the browser
 * bundle). Validated at server start (src/instrumentation.ts), not during `next build`.
 *
 * Environment: BACKOFFICE_ENVIRONMENT, or `production` whenever NODE_ENV=production and it is unset.
 * NODE_ENV=production refuses `development`; `test` is accepted there only on a loopback origin
 * (automated suites against the production build). Production fails closed: https origin, a
 * strong auth secret, a database URL, an owner e-mail and at least one OAuth provider are required;
 * test-only switches are refused. No fixed secret is ever used outside `test`.
 */
export type ProviderCredentials = { clientId: string; clientSecret: string };

export type BackofficeConfig = {
  environment: "development" | "test" | "production";
  origin: string;
  authSecret: string;
  databaseUrl: string;
  ownerEmail: string | null;
  google: ProviderCredentials | null;
  github: ProviderCredentials | null;
  /** Local fake OIDC issuer for automated tests; refused in production. */
  testIssuer: string | null;
  ops: { url: string; token: string } | null;
  sessionHours: number;
  /** Better Auth's per-IP limiter; only automated tests on one address may turn it off. */
  rateLimit: boolean;
  /** Exact reverse-proxy addresses/CIDRs whose X-Forwarded-For chain is trusted (empty: none). */
  trustedProxies: string[];
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function proxies(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of list) {
    const [address = "", prefix, extra] = entry.split("/");
    const v4 = IPV4.test(address);
    const v6 = !v4 && address.includes(":") && IPV6.test(address);
    const bits = prefix === undefined ? null : Number(prefix);
    if (
      extra !== undefined ||
      !(v4 || v6) ||
      (bits !== null && (!Number.isInteger(bits) || bits < (v4 ? 8 : 16) || bits > (v4 ? 32 : 128)))
    )
      throw new Error("TRUSTED_PROXY_IPS entries must be IP addresses or narrow CIDR ranges");
  }
  return list;
}

/**
 * The ops endpoint carries a bearer token. https is required, except for a host that can only be
 * reached on a private network: a single-label name (a Docker service such as
 * `pequeverso-assistant-api`) or a host listed in OPS_API_INSECURE_INTERNAL_HOSTS; loopback is
 * also accepted outside production.
 */
function opsUrlAllowed(url: URL, production: boolean, insecureHosts: string[]): boolean {
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (insecureHosts.includes(host)) return true;
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(host) && host !== "localhost") return true;
  return !production && LOCAL.has(host);
}

const LOCAL = new Set(["localhost", "127.0.0.1"]);

function bareOrigin(name: string, raw: string, allowHttpLocal: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute origin`);
  }
  const local = url.protocol === "http:" && LOCAL.has(url.hostname);
  if (
    url.origin !== raw.replace(/\/$/, "") ||
    (url.protocol !== "https:" && !(allowHttpLocal && local))
  )
    throw new Error(`${name} must be a bare https origin`);
  return url.origin;
}

function pair(id: string | undefined, secret: string | undefined, name: string) {
  const clientId = id?.trim() ?? "";
  const clientSecret = secret?.trim() ?? "";
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) throw new Error(`${name} needs both client id and secret`);
  return { clientId, clientSecret };
}

export function parseConfig(env: Record<string, string | undefined>): BackofficeConfig {
  const nodeProduction = env.NODE_ENV === "production";
  const environment =
    env.BACKOFFICE_ENVIRONMENT?.trim() || (nodeProduction ? "production" : "development");
  if (environment !== "development" && environment !== "test" && environment !== "production")
    throw new Error("BACKOFFICE_ENVIRONMENT must be development, test or production");
  if (nodeProduction && environment === "development")
    throw new Error("BACKOFFICE_ENVIRONMENT=development is refused when NODE_ENV=production");
  const production = environment === "production";
  const origin = bareOrigin(
    "BACKOFFICE_ORIGIN",
    env.BACKOFFICE_ORIGIN?.trim() || "http://localhost:3201",
    !production,
  );
  if (environment === "test" && nodeProduction && !isLoopbackUrl(origin))
    throw new Error("BACKOFFICE_ENVIRONMENT=test on a production build requires a loopback origin");
  const authSecret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (authSecret.length < 32 && environment !== "test")
    throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl && production) throw new Error("DATABASE_URL is required");
  const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase() || null;
  if (!ownerEmail && production) throw new Error("OWNER_EMAIL is required");
  const google = pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, "Google");
  const github = pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, "GitHub");
  const testIssuerRaw = env.AUTH_TEST_ISSUER?.trim() || null;
  if (testIssuerRaw && production) throw new Error("AUTH_TEST_ISSUER is not allowed in production");
  const rateLimitOff = env.AUTH_DISABLE_RATE_LIMIT === "1";
  if (rateLimitOff && production)
    throw new Error("AUTH_DISABLE_RATE_LIMIT is not allowed in production");
  // Test-only switches also require a loopback origin and a disposable loopback database, so a
  // misconfigured shared or remote environment can never run with them.
  if (testIssuerRaw || rateLimitOff) {
    if (!isLoopbackUrl(origin) || (testIssuerRaw && !isLoopbackUrl(testIssuerRaw)))
      throw new Error("test-only authentication settings require loopback origins");
    assertDisposableDatabase(env.DATABASE_URL, true);
  }
  const testIssuer = testIssuerRaw ? bareOrigin("AUTH_TEST_ISSUER", testIssuerRaw, true) : null;
  if (production && !google && !github)
    throw new Error("production needs at least one OAuth provider (Google or GitHub)");
  const opsUrl = env.OPS_API_URL?.trim() || "";
  const opsToken = env.OPS_READ_TOKEN?.trim() || "";
  if (Boolean(opsUrl) !== Boolean(opsToken))
    throw new Error("OPS_API_URL and OPS_READ_TOKEN are set together");
  const insecureHosts = (env.OPS_API_INSECURE_INTERNAL_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (opsUrl) {
    let url: URL;
    try {
      url = new URL(opsUrl);
    } catch {
      throw new Error("OPS_API_URL must be an absolute URL");
    }
    if (!opsUrlAllowed(url, production, insecureHosts))
      throw new Error("OPS_API_URL must be https, or http only to a private-network service name");
    if (url.username || url.password || url.search || url.hash)
      throw new Error("OPS_API_URL must not carry credentials, query or fragment");
  }
  if (opsToken && opsToken.length < 32)
    throw new Error("OPS_READ_TOKEN must have at least 32 characters");
  return {
    environment,
    origin,
    authSecret: authSecret || "test-only-secret-never-used-outside-the-test-environment",
    databaseUrl: databaseUrl || "postgres://localhost:5432/backoffice",
    ownerEmail,
    google,
    github,
    testIssuer,
    ops: opsUrl ? { url: opsUrl.replace(/\/$/, ""), token: opsToken } : null,
    sessionHours: 8,
    rateLimit: !rateLimitOff,
    trustedProxies: proxies(env.TRUSTED_PROXY_IPS),
  };
}
