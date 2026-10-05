import { connection } from "next/server";
import { authReady } from "@/server/auth";

/**
 * Readiness (internal; not to be routed publicly): configuration parses, PostgreSQL answers and
 * the migrated tables exist. Liveness stays on /healthz. The body never says why it is not ready.
 */
export async function GET() {
  await connection();
  const ready = await authReady();
  return Response.json(
    { status: ready ? "ready" : "not_ready" },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
