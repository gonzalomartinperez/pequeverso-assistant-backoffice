// Deterministic stack for the backoffice browser suite (ports owned by this suite):
//   3241  the production build (`next start`) with BACKOFFICE_ENVIRONMENT=test
//   8237  mock ops API serving the SYNTHETIC fixture (scripts/mock-ops.ts)
//   8238  fake OAuth identity provider (scripts/fake-idp.ts), test only
// Needs TEST_DATABASE_URL (a disposable PostgreSQL server); a fresh database is created per run.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { assertDisposableDatabase } from "../src/server/fixture-safety.ts";
import { migrate } from "./db-migrate.ts";

let base: string;
try {
  base = assertDisposableDatabase(process.env.TEST_DATABASE_URL, false);
} catch (error) {
  console.error(error instanceof Error ? error.message : "invalid TEST_DATABASE_URL");
  process.exit(2);
}
const name = `bo_test_e2e_${randomBytes(4).toString("hex")}`;
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`CREATE DATABASE ${name}`);
const url = new URL(base);
url.pathname = `/${name}`;
await migrate(url.toString(), path.resolve(import.meta.dirname, "..", "migrations"));

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
          env: { ...process.env, MOCK_OPS_PORT: "8237", OPS_READ_TOKEN: token },
        }),
      ]),
  spawn(process.execPath, ["scripts/fake-idp.ts"], {
    stdio: "inherit",
    env: { ...process.env, FAKE_IDP_PORT: "8238" },
  }),
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3241"], {
    stdio: "inherit",
    env: {
      ...process.env,
      BACKOFFICE_ENVIRONMENT: "test",
      BACKOFFICE_ORIGIN: "http://localhost:3241",
      BETTER_AUTH_SECRET: "e2e-secret-not-for-production-000000000000",
      DATABASE_URL: url.toString(),
      OWNER_EMAIL: "owner@example.test",
      AUTH_TEST_ISSUER: "http://127.0.0.1:8238",
      // Every test signs in from 127.0.0.1; Better Auth allows 3 sign-in starts per 10 s per IP.
      AUTH_DISABLE_RATE_LIMIT: "1",
      OPS_API_URL: live?.url ?? "http://127.0.0.1:8237",
      OPS_READ_TOKEN: token,
    },
  }),
];

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
  await admin.end();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", () => void stop());
