/**
 * Guards for test-only machinery (fake identity provider, disabled rate limiting, scripts that
 * create and drop databases). They must only ever touch a loopback PostgreSQL whose database name
 * says it is disposable. Messages never include the offending URL (it may carry credentials).
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** A loopback PostgreSQL URL; with `requireTestName`, its database name must contain test/fixture. */
export function assertDisposableDatabase(
  value: string | undefined,
  requireTestName: boolean,
): string {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("A disposable loopback PostgreSQL URL is required (value redacted)");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !LOOPBACK.has(url.hostname))
    throw new Error("Test databases must be on a loopback host (value redacted)");
  if (requireTestName && !/(test|fixture)/i.test(url.pathname))
    throw new Error("Test databases must have a test/fixture name (value redacted)");
  return url.toString();
}
