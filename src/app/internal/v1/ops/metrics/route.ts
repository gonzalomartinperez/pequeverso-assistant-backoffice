import { config } from "@/server/config";
import { observability } from "@/server/observability";

/** Private network scrape only: no cookies, roles or API client token used for machine access. */
export async function GET(request: Request) {
  const source = observability(config().observability);
  const access = source.authorize(request.headers.get("authorization"));
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (access !== "allowed")
    return new Response(null, { status: access === "disabled" ? 404 : 401, headers });
  return new Response(source.metrics(), {
    headers: { ...headers, "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
