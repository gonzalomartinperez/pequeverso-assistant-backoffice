import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import pg from "pg";
import {
  browserDatabase,
  withoutBootstrapDatabaseCredentials,
} from "../../scripts/browser-database.ts";
import { assertDisposableDatabase } from "../../src/server/fixture-safety.ts";

const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const base = raw ? assertDisposableDatabase(raw, false) : undefined;
const permissionDenied = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "42501";

test("browser runtime has IAM DML without ownership, TEMP, migration access or cross-database admission", {
  skip: !base && "TEST_DATABASE_URL not set",
}, async () => {
  assert.ok(base);
  const migrations = path.resolve(import.meta.dirname, "../../migrations");
  const first = await browserDatabase(base, migrations);
  const runtime = new pg.Client({ connectionString: first.runtimeUrl });
  let second: Awaited<ReturnType<typeof browserDatabase>> | undefined;
  try {
    second = await browserDatabase(base, migrations);
    await runtime.connect();
    const flags = await runtime.query(
      `SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
                has_database_privilege(current_user,current_database(),'CONNECT') AS connect,
                has_database_privilege(current_user,current_database(),'TEMP') AS temporary,
                has_database_privilege(current_user,current_database(),'CREATE') AS create
         FROM pg_roles WHERE rolname=current_user`,
    );
    assert.deepEqual(flags.rows, [
      {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        connect: true,
        temporary: false,
        create: false,
      },
    ]);
    const ownership = await runtime.query(
      "SELECT count(*)::int AS count FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)",
    );
    assert.equal(ownership.rows[0].count, 0);
    await runtime.query(
      `INSERT INTO auth_user(id,name,email,"emailVerified",role)
         VALUES('runtime-fixture','Runtime fixture','runtime@example.test',true,'viewer')`,
    );
    assert.equal(
      (await runtime.query("SELECT count(*)::int AS count FROM auth_user")).rows[0].count,
      1,
    );
    await runtime.query("UPDATE auth_user SET name='Runtime updated' WHERE id='runtime-fixture'");
    await runtime.query("DELETE FROM auth_user WHERE id='runtime-fixture'");
    for (const query of [
      "CREATE TEMP TABLE forbidden_temp(id int)",
      "CREATE TABLE public.forbidden_table(id int)",
      "SELECT * FROM backoffice_schema_migrations LIMIT 0",
      "DELETE FROM backoffice_access_audit WHERE false",
      "UPDATE backoffice_access_audit SET action=action WHERE false",
    ])
      await assert.rejects(runtime.query(query), permissionDenied);

    for (const [url, target] of [
      [first.runtimeUrl, second.database],
      [second.runtimeUrl, first.database],
    ]) {
      assert.ok(url && target);
      const crossed = new URL(url);
      crossed.pathname = `/${target}`;
      const denied = new pg.Client({ connectionString: crossed.toString() });
      try {
        await assert.rejects(denied.connect(), permissionDenied);
      } finally {
        await denied.end();
      }
    }
    assert.deepEqual(
      withoutBootstrapDatabaseCredentials({
        NODE_ENV: "test",
        PATH: "fixture-path",
        TEST_DATABASE_URL: "fixture-bootstrap-secret",
        DATABASE_URL: "fixture-bootstrap-secret",
        PGPASSWORD: "fixture-bootstrap-secret",
        PGPASSFILE: "fixture-bootstrap-file",
        PGUSER: "fixture-bootstrap-user",
        POSTGRES_PASSWORD: "fixture-bootstrap-secret",
      }),
      { NODE_ENV: "test", PATH: "fixture-path" },
    );
  } finally {
    await runtime.end();
    await second?.close();
    await first.close();
  }
});
