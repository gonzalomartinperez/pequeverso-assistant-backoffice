// Local cross-origin storefront harness: a TEST FIXTURE that plays the storefront's role
// (launcher, outer panel, open/minimize/expand, preferences) around the real /embed page. It is
// not the production store and contains no conversation logic. Its host script
// (tests/fixtures/host/host.ts, served with types stripped) is the reference implementation
// documented in docs/embed-integration.md.
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";

const root = new URL("../tests/fixtures/", import.meta.url);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
};
type Options = { port?: number; assistantOrigin?: string };

function route(pathname: string): string {
  if (pathname === "/host.js") return "host/host.ts";
  if (pathname === "/host.css") return "host/host.css";
  if (pathname.startsWith("/media/")) return `storefront/media/${path.basename(pathname)}`;
  if (pathname === "/" || pathname === "/index.html") return "host/index.html";
  return "host/product.html";
}

export function startEmbedHost({
  port = 3210,
  assistantOrigin = "http://localhost:3207",
}: Options = {}): Promise<Server> {
  const server = createServer(async (req, res) => {
    const file = route(new URL(req.url ?? "/", "http://localhost").pathname);
    try {
      const bytes = await readFile(new URL(file, root));
      const type = TYPES[path.extname(file)] ?? "application/octet-stream";
      let body: string | Buffer = bytes;
      if (type.startsWith("text/")) {
        const text = bytes.toString("utf8").replaceAll("__ASSISTANT_ORIGIN__", assistantOrigin);
        body = file.endsWith(".ts") ? stripTypeScriptTypes(text) : text;
      }
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-store",
        // What the storefront must send: frame only the assistant origin.
        "content-security-policy": `frame-src ${assistantOrigin}; object-src 'none'; base-uri 'self'`,
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.main) {
  const server = await startEmbedHost({
    assistantOrigin: process.env.ASSISTANT_ORIGIN ?? "http://localhost:3207",
  });
  console.log("Storefront harness on http://localhost:3210");
  const stop = () => {
    server.closeAllConnections();
    server.close();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
