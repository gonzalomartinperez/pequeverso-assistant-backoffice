// Applies migrations/*.sql in order, once each, under a PostgreSQL advisory lock. An applied file
// whose content changed is an error (migrations are append-only). Depends only on `pg` and Node,
// so the production image can run it as a separate one-shot command before the new release:
//   DATABASE_URL=postgres://… node scripts/db-migrate.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const LOCK_ID = 7_312_004_011; // arbitrary, constant for this application

export async function migrate(databaseUrl: string, directory: string): Promise<string[]> {
  const files = readdirSync(directory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS backoffice_schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM backoffice_schema_migrations",
    );
    const done = new Map(rows.map((row) => [row.version, row.checksum]));
    for (const name of files) {
      const sql = readFileSync(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(name);
      if (previous) {
        if (previous !== checksum)
          throw new Error(`migration ${name} changed after it was applied`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO backoffice_schema_migrations (version, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      applied.push(name);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    await client.end();
  }
  return applied;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }
  const directory = path.resolve(import.meta.dirname, "..", "migrations");
  migrate(url, directory)
    .then((applied) =>
      console.log(
        `Migrations: ${applied.length} applied (${applied.join(", ") || "none pending"}).`,
      ),
    )
    .catch((error: unknown) => {
      console.error(
        `Migration failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      process.exit(1);
    });
}
