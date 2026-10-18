// Deterministic stack for the backoffice browser suite (ports owned by this suite):
//   3241  the production build (`next start`) with BACKOFFICE_ENVIRONMENT=test
//   8237  mock ops API serving the SYNTHETIC fixture (scripts/mock-ops.ts)
//   8238  fake OAuth identity provider (scripts/fake-idp.ts), test only
// Needs TEST_DATABASE_URL (a disposable PostgreSQL server); a fresh database is created per run.
import { spawn } from "node:child_process";
import path from "node:path";
import { assertDisposableDatabase } from "../src/server/fixture-safety.ts";
import { browserDatabase, withoutBootstrapDatabaseCredentials } from "./browser-database.ts";

let base: string;
try {
  base = assertDisposableDatabase(process.env.TEST_DATABASE_URL, false);
} catch (error) {
  console.error(error instanceof Error ? error.message : "invalid TEST_DATABASE_URL");
  process.exit(2);
}
const database = await browserDatabase(base, path.resolve(import.meta.dirname, "..", "migrations"));
const childEnv = withoutBootstrapDatabaseCredentials(process.env);

// LIVE_OPS_URL/LIVE_OPS_TOKEN point the dashboard at a running pequeverso-assistant-api (fixture
// provider) instead of the mock; used by tests/backoffice/live-ops.spec.ts.
const live = process.env.LIVE_OPS_URL
  ? { url: process.env.LIVE_OPS_URL, token: process.env.LIVE_OPS_TOKEN ?? "" }
  : null;
const token = live?.token ?? "test-ops-read-token-0000000000000000";
const children = [
  ...(live
    ? []
    : [
        spawn(process.execPath, ["scripts/mock-ops.ts"], {
          stdio: "inherit",
          env: { ...childEnv, MOCK_OPS_PORT: "8237", OPS_READ_TOKEN: token },
        }),
      ]),
  spawn(process.execPath, ["scripts/fake-idp.ts"], {
    stdio: "inherit",
    env: { ...childEnv, FAKE_IDP_PORT: "8238" },
  }),
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3241"], {
    stdio: "inherit",
    env: {
      ...childEnv,
      BACKOFFICE_ENVIRONMENT: "test",
      BACKOFFICE_ORIGIN: "http://localhost:3241",
      BETTER_AUTH_SECRET: "e2e-secret-not-for-production-000000000000",
      DATABASE_URL: database.runtimeUrl,
      OWNER_EMAIL: "owner@example.test",
      AUTH_TEST_ISSUER: "http://127.0.0.1:8238",
      // Every test signs in from 127.0.0.1; Better Auth allows 3 sign-in starts per 10 s per IP.
      AUTH_DISABLE_RATE_LIMIT: "1",
      OPS_TELEMETRY_ENABLED: "true",
      OBSERVABILITY_METRICS_ENABLED: "true",
      OBSERVABILITY_READ_TOKEN: "test-observability-token-separate-000000000000",
      OPS_API_URL: live?.url ?? "http://127.0.0.1:8237",
      OPS_READ_TOKEN: token,
    },
  }),
];
// Register immediately so an exit/error during startup cannot race cleanup observation.
const childClosed = children.map(
  (child) => new Promise<void>((resolve) => child.once("close", () => resolve())),
);

let stopping = false;
let childFailed = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  try {
    await Promise.all(childClosed);
    await database.close();
    console.error(
      "Browser fixture cleanup: child processes closed, database and runtime role removed",
    );
    process.exit(childFailed ? 1 : 0);
  } catch {
    // Never print URLs or database credentials, including errors during fixture cleanup.
    console.error("Browser fixture cleanup failed; preserve the fixture evidence");
    process.exit(1);
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children)
  child.on("exit", () => {
    if (!stopping) childFailed = true;
    void stop();
  });
for (const child of children)
  child.on("error", () => {
    childFailed = true;
    void stop();
  });
