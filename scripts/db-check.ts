// Schema drift check (CI/dev, needs a disposable PostgreSQL): applies the committed migrations to an
// empty database and asks Better Auth whether this configuration would still create or add
// anything. Any pending table, column or index means the committed SQL is stale.
// A throwaway database is created inside that server and dropped afterwards.
//   TEST_DATABASE_URL=postgres://… node scripts/db-check.ts   (falls back to DATABASE_URL in CI)
import { randomBytes } from "node:crypto";
import path from "node:path";
import { getMigrations } from "better-auth/db/migration";
import pg from "pg";
import { authOptions } from "../src/features/auth/adapters/better-auth.ts";
import type { AccessDeps } from "../src/features/auth/application/access.ts";
import { assertDisposableDatabase } from "../src/server/fixture-safety.ts";
import { migrate } from "./db-migrate.ts";

let server: string;
try {
  server = assertDisposableDatabase(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
    false,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "invalid database URL");
  process.exit(2);
}
const name = `bo_test_drift_${randomBytes(4).toString("hex")}`;
const admin = new pg.Client({ connectionString: server });
await admin.connect();
await admin.query(`CREATE DATABASE ${name}`);
const target = new URL(server);
target.pathname = `/${name}`;
const url = target.toString();
await migrate(url, path.resolve(import.meta.dirname, "..", "migrations"));
// Applying twice must be a no-op (checksums recorded, nothing pending).
const again = await migrate(url, path.resolve(import.meta.dirname, "..", "migrations"));
const pool = new pg.Pool({ connectionString: url });
const provider = { clientId: "check", clientSecret: "check" };
const options = authOptions(
  {
    origin: "http://localhost:3201",
    secret: "schema-check-secret-000000000000000000",
    secureCookies: false,
    sessionHours: 8,
    google: provider,
    github: provider,
    testIssuer: "http://127.0.0.1:1",
  },
  pool,
  {} as AccessDeps,
);
const pending = await getMigrations(options);
await pool.end();
await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.end();
const problems = [
  ...(again.length ? [`migrations re-applied: ${again.join(", ")}`] : []),
  ...pending.toBeCreated.map((table) => `missing table ${table.table}`),
  ...pending.toBeAdded.map(
    (table) => `missing columns in ${table.table}: ${Object.keys(table.fields).join(", ")}`,
  ),
  ...pending.toBeAddedIndexes.map((index) => `missing index ${index.name}`),
  ...pending.schemaProblems,
];
for (const problem of problems) console.error(problem);
console.log(`Schema check: ${problems.length} differences between migrations and Better Auth.`);
if (problems.length) process.exitCode = 1;
