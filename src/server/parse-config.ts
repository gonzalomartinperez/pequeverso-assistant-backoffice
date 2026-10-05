import { assertDisposableDatabase, isLoopbackUrl } from "./fixture-safety.ts";

/**
 * Backoffice runtime configuration, read on the server only (never inlined into the browser bundle). Parsed lazily
 * on first use so `next build` needs no secrets. Production fails closed: https origin, a strong
 * auth secret, a database URL, an owner e-mail and at least one OAuth provider are required, and
 * the local test identity provider is refused.
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
};

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
  const environment = env.BACKOFFICE_ENVIRONMENT ?? "development";
  if (environment !== "development" && environment !== "test" && environment !== "production")
    throw new Error("BACKOFFICE_ENVIRONMENT must be development, test or production");
  const production = environment === "production";
  const origin = bareOrigin(
    "BACKOFFICE_ORIGIN",
    env.BACKOFFICE_ORIGIN?.trim() || "http://localhost:3201",
    !production,
  );
  const authSecret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (authSecret.length < 32) {
    if (production) throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
  }
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
  if (opsUrl) {
    const url = new URL(opsUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("OPS_API_URL must be http(s)");
    if (url.username || url.password || url.search || url.hash)
      throw new Error("OPS_API_URL must not carry credentials, query or fragment");
  }
  if (opsToken && opsToken.length < 32)
    throw new Error("OPS_READ_TOKEN must have at least 32 characters");
  return {
    environment,
    origin,
    authSecret: authSecret || "development-only-secret-not-for-production-use",
    databaseUrl: databaseUrl || "postgres://localhost:5432/backoffice",
    ownerEmail,
    google,
    github,
    testIssuer,
    ops: opsUrl ? { url: opsUrl.replace(/\/$/, ""), token: opsToken } : null,
    sessionHours: 8,
    rateLimit: !rateLimitOff,
  };
}
