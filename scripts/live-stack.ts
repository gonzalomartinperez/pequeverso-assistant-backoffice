// Joint-verification stack against a RUNNING pequeverso-assistant-api (start it yourself with the
// fixture provider; never with paid AI). Same ports as the deterministic suite, so stop that first:
//   3207  same-origin proxy → /api/* API_UPSTREAM (default http://127.0.0.1:8000), rest web (3218)
//   3210  storefront harness
// The web app uses the real storefront origin because the API catalog links there.
import { spawn } from "node:child_process";
import { startEmbedHost } from "./embed-host.ts";
import { startTestProxy } from "./test-proxy.ts";

const api = process.env.API_UPSTREAM ?? "http://127.0.0.1:8000";
const web = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", "3218"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      EMBED_ALLOWED_ORIGINS: "http://localhost:3210",
      STOREFRONT_ORIGIN: "https://pequeverso.com",
    },
  },
);
const proxy = await startTestProxy(3207, "http://127.0.0.1:3218", api);
const host = await startEmbedHost({ port: 3210, assistantOrigin: "http://localhost:3207" });
console.log(`Live stack: proxy :3207 → API ${api}, harness :3210`);

function stop() {
  web.kill("SIGTERM");
  for (const server of [proxy, host]) {
    server.closeAllConnections();
    server.close();
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
