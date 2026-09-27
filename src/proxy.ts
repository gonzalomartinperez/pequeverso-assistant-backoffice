import { type NextRequest, NextResponse } from "next/server";
import { parseAllowedOrigins } from "./features/embed/protocol";

/**
 * Framing policy per request (runtime configuration, not build time):
 * - `/embed` may be framed only by the exact origins in EMBED_ALLOWED_ORIGINS
 *   (`frame-ancestors 'none'` when the list is empty). No X-Frame-Options is sent there:
 *   it cannot express an allowlist and would conflict with `frame-ancestors`.
 * - Every other page refuses framing with both headers.
 * A proxy in front must not add or override these headers (docs/embed-integration.md).
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const common = "base-uri 'self'; form-action 'self'; object-src 'none'";
  if (request.nextUrl.pathname === "/embed") {
    const origins = parseAllowedOrigins(process.env.EMBED_ALLOWED_ORIGINS);
    response.headers.set(
      "Content-Security-Policy",
      `${common}; frame-ancestors ${origins.length ? origins.join(" ") : "'none'"}`,
    );
    response.headers.set("Cache-Control", "private, no-store");
  } else {
    response.headers.set("Content-Security-Policy", `${common}; frame-ancestors 'none'`);
    response.headers.set("X-Frame-Options", "DENY");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|fonts/|brand/|favicon.ico|apple-touch-icon.png|icon-192.png).*)",
  ],
};
