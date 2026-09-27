// Test-only same-origin reverse proxy, mirroring the intended production routing
// (docs/deployment-contract.md): `/api/*` goes to the API unchanged (no prefix stripping, no
// buffering), everything else to the web app. Production routing belongs to vps-ops.
import { createServer, request, type Server } from "node:http";

export function startTestProxy(
  port: number,
  webOrigin: string,
  apiOrigin: string,
): Promise<Server> {
  const server = createServer((incoming, outgoing) => {
    const path = incoming.url ?? "/";
    const origin = path.startsWith("/api/") ? apiOrigin : webOrigin;
    const upstream = request(
      new URL(path, origin),
      { method: incoming.method, headers: incoming.headers },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        // An upstream that dies mid-stream closes the client side too (like a real proxy should).
        response.on("aborted", () => outgoing.destroy());
        response.on("error", () => outgoing.destroy());
        response.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    outgoing.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
