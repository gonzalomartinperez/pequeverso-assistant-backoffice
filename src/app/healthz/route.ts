/**
 * Liveness of the frontend process only (no API call): the assistant's availability is the
 * API's own concern and the store must never depend on this answer. See docs/deployment-contract.md.
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
