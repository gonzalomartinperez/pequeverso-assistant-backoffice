// Disposable browser/integration fixtures only. Bootstrap credentials never reach the web server.
import { randomBytes } from "node:crypto";
import pg, { escapeIdentifier, escapeLiteral } from "pg";
import { assertDisposableDatabase } from "../src/server/fixture-safety.ts";
import { migrate } from "./db-migrate.ts";

export function withoutBootstrapDatabaseCredentials(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...env };
  for (const key of Object.keys(result))
    if (
      key === "DATABASE_URL" ||
      key === "TEST_DATABASE_URL" ||
      key.startsWith("PG") ||
      key.startsWith("POSTGRES_")
    )
      delete result[key];
  return result;
}

export async function browserDatabase(base: string, migrations: string) {
  const source = assertDisposableDatabase(base, false);
  const suffix = randomBytes(6).toString("hex");
  const database = `bo_test_e2e_${suffix}`;
  const role = `bo_test_runtime_${suffix}`;
  const password = randomBytes(32).toString("hex");
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  let databaseCreated = false;
  let roleCreated = false;
  let closed = false;
  const ownerUrl = new URL(source);
  ownerUrl.pathname = `/${database}`;
  try {
    await admin.query(
      `CREATE ROLE ${escapeIdentifier(role)} LOGIN PASSWORD ${escapeLiteral(password)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`,
    );
    roleCreated = true;
    await admin.query(`CREATE DATABASE ${escapeIdentifier(database)}`);
    databaseCreated = true;
    await admin.query(`REVOKE ALL ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC`);
    await admin.query(
      `GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(role)}`,
    );
    await migrate(ownerUrl.toString(), migrations);
    const owner = new pg.Client({ connectionString: ownerUrl.toString() });
    try {
      await owner.connect();
      await owner.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
      await owner.query(`GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(role)}`);
      await owner.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_user, public.auth_session,
         public.auth_account, public.auth_verification, public.auth_rate_limit,
         public.backoffice_invitation TO ${escapeIdentifier(role)}`,
      );
      await owner.query(
        `GRANT SELECT, INSERT ON public.backoffice_access_audit TO ${escapeIdentifier(role)}`,
      );
      await owner.query(
        `REVOKE ALL ON public.backoffice_schema_migrations FROM ${escapeIdentifier(role)}`,
      );
      await owner.query(
        `REVOKE UPDATE, DELETE ON public.backoffice_access_audit FROM ${escapeIdentifier(role)}`,
      );
    } finally {
      await owner.end();
    }
  } catch (error) {
    try {
      if (databaseCreated)
        await admin.query(`DROP DATABASE ${escapeIdentifier(database)} WITH (FORCE)`);
      if (roleCreated) await admin.query(`DROP ROLE ${escapeIdentifier(role)}`);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Fixture initialization and cleanup failed");
    } finally {
      await admin.end();
    }
    throw error;
  }
  const runtime = new URL(ownerUrl);
  runtime.username = role;
  runtime.password = password;
  return {
    database,
    role,
    // Secret: never log or expose either connection string through the web app.
    runtimeUrl: runtime.toString(),
    async close() {
      if (closed) return;
      try {
        const active = await admin.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1",
          [database],
        );
        if (active.rows[0]?.count !== 0)
          throw new Error("Close fixture clients and child processes before database cleanup");
        await admin.query(`DROP DATABASE ${escapeIdentifier(database)}`);
        await admin.query(`DROP ROLE ${escapeIdentifier(role)}`);
        const remaining = await admin.query<{ database: boolean; role: boolean }>(
          `SELECT EXISTS(SELECT FROM pg_database WHERE datname=$1) AS database,
                  EXISTS(SELECT FROM pg_roles WHERE rolname=$2) AS role`,
          [database, role],
        );
        if (remaining.rows[0]?.database !== false || remaining.rows[0]?.role !== false)
          throw new Error("Disposable database or runtime role was not removed");
      } finally {
        closed = true;
        await admin.end();
      }
    },
  };
}
