// Deterministic verification stack (ports owned by this suite):
//   3207  same-origin proxy  → /api/* mock API (8207), everything else web (3208 or WEB_UPSTREAM)
//   3210  storefront harness (cross-origin host page + fixture storefront pages and media)
// The web app gets EMBED_ALLOWED_ORIGINS and STOREFRONT_ORIGIN pointing at the harness.
import { spawn } from "node:child_process";
import { startEmbedHost } from "./embed-host.ts";
import { startMockApi } from "./mock-api.ts";
import { startTestProxy } from "./test-proxy.ts";

const HARNESS = "http://localhost:3210";
const api = await startMockApi({
  port: 8207,
  allowedOrigins: ["http://localhost:3207"],
  storefront: HARNESS,
});
const web = process.env.WEB_UPSTREAM
  ? null
  : spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3208"], {
      stdio: "inherit",
      env: {
        ...process.env,
        EMBED_ALLOWED_ORIGINS: HARNESS,
        STOREFRONT_ORIGIN: HARNESS,
        ASSISTANT_LINK_HOSTS: "consumer.hotmart.com,refund.hotmart.com",
        // The backoffice config is validated at startup; the chat suite runs it as a loopback test.
        BACKOFFICE_ENVIRONMENT: "test",
      },
    });
const proxy = await startTestProxy(
  3207,
  process.env.WEB_UPSTREAM ?? "http://127.0.0.1:3208",
  "http://127.0.0.1:8207",
);
const host = await startEmbedHost({ port: 3210, assistantOrigin: "http://localhost:3207" });

function stop() {
  web?.kill("SIGTERM");
  for (const server of [api, proxy, host]) {
    server.closeAllConnections();
    server.close();
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web?.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 0;
});
