import { type NextRequest, NextResponse } from "next/server";
import { parseAllowedOrigins } from "./features/embed/protocol";
import { backofficeCsp } from "./server/csp";

const BACKOFFICE = /^\/(?:panel|ingresar|invitacion|api\/auth)(?:\/|$)/;

/**
 * Headers per request:
 * - Backoffice routes: nonce-based CSP, `frame-ancestors 'none'`, X-Frame-Options DENY,
 *   `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`.
 * - Legacy `/embed` (to be removed): framable only by EMBED_ALLOWED_ORIGINS.
 * - Everything else refuses framing.
 * A proxy in front must not add or override these headers (docs/deployment-contract.md).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (BACKOFFICE.test(path)) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = backofficeCsp(nonce, process.env.NODE_ENV === "development");
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    // HSTS when the configured origin is https (the edge may send the same value; never weaker).
    if (process.env.BACKOFFICE_ORIGIN?.startsWith("https://"))
      response.headers.set("Strict-Transport-Security", "max-age=31536000");
    return response;
  }
  const response = NextResponse.next();
  const common = "base-uri 'self'; form-action 'self'; object-src 'none'";
  if (path === "/embed") {
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
