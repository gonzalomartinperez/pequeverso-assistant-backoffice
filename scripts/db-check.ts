// Schema drift check (CI/dev, needs a disposable PostgreSQL): applies the committed migrations to an
// empty database and asks Better Auth whether this configuration would still create or add
// anything. Any pending table, column or index means the committed SQL is stale.
//   TEST_DATABASE_URL=postgres://… node scripts/db-check.ts
import path from "node:path";
import { getMigrations } from "better-auth/db/migration";
import pg from "pg";
import { authOptions } from "../src/features/auth/adapters/better-auth.ts";
import type { AccessDeps } from "../src/features/auth/application/access.ts";
import { migrate } from "./db-migrate.ts";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is required (a disposable database)");
  process.exit(2);
}
await migrate(url, path.resolve(import.meta.dirname, "..", "migrations"));
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
const problems = [
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
