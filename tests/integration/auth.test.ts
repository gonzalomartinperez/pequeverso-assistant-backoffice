// Real Better Auth + PostgreSQL + OAuth callback flow against the local fake identity provider.
// Needs a disposable database: TEST_DATABASE_URL=postgres://… npm run test:integration
// (each run creates and drops its own database inside that server).
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { migrate } from "../../scripts/db-migrate.ts";
import { createAuth, INVITATION_COOKIE } from "../../src/features/auth/adapters/better-auth.ts";
import { nodeSecrets } from "../../src/features/auth/adapters/node-secrets.ts";
import { PostgresAccessStore } from "../../src/features/auth/adapters/postgres-access-store.ts";
import {
  type AccessDeps,
  inviteMember,
  removeMember,
} from "../../src/features/auth/application/access.ts";
import { assertDisposableDatabase } from "../../src/server/fixture-safety.ts";

// TEST_DATABASE_URL (or DATABASE_URL in CI) names a disposable LOOPBACK server; the test creates and
// drops its own `bo_test_*` database there. A remote or malformed URL fails before connecting.
const rawUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const baseUrl = rawUrl ? assertDisposableDatabase(rawUrl, false) : undefined;
const ORIGIN = "http://localhost:3299";
const IDP_PORT = 8298;
const IDP = `http://127.0.0.1:${IDP_PORT}`;

describe("backoffice authentication (PostgreSQL, real callback)", {
  skip: !baseUrl && "TEST_DATABASE_URL not set",
}, () => {
  const database = `bo_test_${randomBytes(4).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;
  let idp: ChildProcess;
  let deps: AccessDeps;
  let auth: ReturnType<typeof createAuth>;

  before(async () => {
    admin = new pg.Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${database}`);
    const url = new URL(baseUrl ?? "");
    url.pathname = `/${database}`;
    await migrate(url.toString(), path.resolve(import.meta.dirname, "../../migrations"));
    pool = new pg.Pool({ connectionString: url.toString() });
    pool.on("error", () => undefined); // DROP DATABASE … WITH (FORCE) ends idle connections at teardown
    deps = {
      store: new PostgresAccessStore(pool),
      secrets: nodeSecrets,
      clock: { now: () => new Date() },
      ownerEmail: "owner@example.test",
    };
    auth = createAuth(
      {
        origin: ORIGIN,
        secret: "integration-secret-0000000000000000000000",
        secureCookies: false,
        sessionHours: 8,
        google: null,
        github: null,
        testIssuer: IDP,
        rateLimit: false,
      },
      pool,
      deps,
    );
    idp = spawn(process.execPath, ["scripts/fake-idp.ts"], {
      env: { ...process.env, FAKE_IDP_PORT: String(IDP_PORT) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    await new Promise<void>((resolve) => idp.stdout?.once("data", () => resolve()));
  });

  after(async () => {
    idp?.kill();
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin?.end();
  });

  type Jar = Map<string, string>;
  function store(jar: Jar, response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair?.indexOf("=") ?? -1;
      if (!pair || index < 0) continue;
      const value = pair.slice(index + 1);
      if (/max-age=0/i.test(line) || value === "") jar.delete(pair.slice(0, index));
      else jar.set(pair.slice(0, index), value);
    }
  }
  const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  /** Full OAuth round trip; returns the final redirect location and the cookie jar. */
  async function signIn(
    identity: { email: string; email_verified?: boolean; sub?: string },
    jar: Jar = new Map(),
  ) {
    await fetch(`${IDP}/__identity`, { method: "POST", body: JSON.stringify(identity) });
    const start = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, cookie: cookieHeader(jar) },
        body: JSON.stringify({
          provider: "test-idp",
          callbackURL: "/panel",
          errorCallbackURL: "/ingresar",
        }),
      }),
    );
    assert.equal(start.status, 200);
    store(jar, start);
    const { url } = (await start.json()) as { url: string };
    const authorize = await fetch(url, { redirect: "manual" });
    const callback = authorize.headers.get("location") ?? "";
    assert.ok(
      callback.startsWith(`${ORIGIN}/api/auth/oauth2/callback/test-idp`) ||
        callback.startsWith(`${ORIGIN}/api/auth/callback/test-idp`),
      callback,
    );
    const done = await auth.handler(
      new Request(callback, { headers: { cookie: cookieHeader(jar) } }),
    );
    store(jar, done);
    return { status: done.status, location: done.headers.get("location") ?? "", jar };
  }

  async function session(jar: Jar) {
    return auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(jar) }) });
  }

  async function userCount(email: string) {
    const { rows } = await pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM auth_user WHERE email = $1",
      [email],
    );
    return Number(rows[0]?.n);
  }

  it("admits the configured owner with the owner role and an HttpOnly session", async () => {
    const result = await signIn({ email: "Owner@Example.test", sub: "owner-1" });
    assert.match(result.location, /\/panel$/);
    const current = await session(result.jar);
    assert.equal(current?.user.email, "owner@example.test");
    assert.equal(await deps.store.memberRole(current?.user.id ?? ""), "owner");
  });

  it("rejects an uninvited identity in the owner's domain and persists nothing", async () => {
    const result = await signIn({ email: "colleague@example.test", sub: "c-1" });
    assert.match(result.location, /\/ingresar\?error=/);
    assert.equal(await session(result.jar), null);
    assert.equal(await userCount("colleague@example.test"), 0);
  });

  it("rejects an unverified e-mail, even the owner's", async () => {
    await pool.query("DELETE FROM auth_user WHERE email = 'owner@example.test'");
    const result = await signIn({
      email: "owner@example.test",
      email_verified: false,
      sub: "owner-2",
    });
    assert.match(result.location, /\/ingresar\?error=/);
    assert.equal(await userCount("owner@example.test"), 0);
  });

  it("admits an invited viewer once; the same invitation cannot admit anyone else", async () => {
    const ownerLogin = await signIn({ email: "owner@example.test", sub: "owner-3" });
    const ownerSession = await session(ownerLogin.jar);
    const owner = {
      id: ownerSession?.user.id ?? "",
      email: "owner@example.test",
      role: "owner" as const,
    };
    const invite = await inviteMember(deps, owner, "viewer@example.test", "viewer");
    assert.ok(invite.ok);
    if (!invite.ok) return;
    // Wrong e-mail with the right token: refused, token still usable.
    const intruder = await signIn(
      { email: "intruder@example.test", sub: "i-1" },
      new Map([[INVITATION_COOKIE, invite.token]]),
    );
    assert.match(intruder.location, /\/ingresar\?error=/);
    assert.equal(await userCount("intruder@example.test"), 0);

    const viewer = await signIn(
      { email: "viewer@example.test", sub: "v-1" },
      new Map([[INVITATION_COOKIE, invite.token]]),
    );
    assert.match(viewer.location, /\/panel$/);
    const current = await session(viewer.jar);
    assert.equal(await deps.store.memberRole(current?.user.id ?? ""), "viewer");

    const again = await signIn(
      { email: "second@example.test", sub: "s-1" },
      new Map([[INVITATION_COOKIE, invite.token]]),
    );
    assert.match(again.location, /\/ingresar\?error=/);
  });

  it("signs an existing member back in without an invitation", async () => {
    const result = await signIn({ email: "viewer@example.test", sub: "v-1" });
    assert.match(result.location, /\/panel$/);
  });

  it("revoking a member ends existing sessions immediately", async () => {
    const result = await signIn({ email: "viewer@example.test", sub: "v-1" });
    const current = await session(result.jar);
    assert.ok(current);
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM auth_user WHERE email = 'owner@example.test'",
    );
    const owner = { id: rows[0]?.id ?? "", email: "owner@example.test", role: "owner" as const };
    const removed = await removeMember(deps, owner, current?.user.id ?? "");
    assert.equal(removed.ok, true);
    assert.equal(await session(result.jar), null);
    const back = await signIn({ email: "viewer@example.test", sub: "v-1" });
    assert.match(back.location, /\/ingresar\?error=/, "a removed member needs a new invitation");
  });

  it("refuses cookie-bearing requests from a foreign Origin and foreign callback URLs", async () => {
    const owner = await signIn({ email: "owner@example.test", sub: "owner-3" });
    assert.match(owner.location, /\/panel$/);
    const forged = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          cookie: cookieHeader(owner.jar),
        },
        body: "{}",
      }),
    );
    assert.equal(forged.status, 403);
    assert.ok(await session(owner.jar), "the forged sign-out did not end the session");
    const redirect = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ provider: "test-idp", callbackURL: "https://evil.example/steal" }),
      }),
    );
    assert.equal(redirect.status, 403);
  });

  it("never links a new identity to an existing account implicitly, even with the same verified e-mail", async () => {
    const result = await signIn({ email: "owner@example.test", sub: "another-account-of-owner" });
    assert.match(result.location, /\/ingresar\?error=/);
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM auth_account a JOIN auth_user u ON u.id = a."userId" WHERE u.email = 'owner@example.test'`,
    );
    assert.equal(Number(rows[0]?.n), 1);
  });

  it("rejects a callback whose OAuth state does not match the browser's state cookie", async () => {
    await fetch(`${IDP}/__identity`, {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.test", sub: "owner-3" }),
    });
    const jar: Jar = new Map();
    const start = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({
          provider: "test-idp",
          callbackURL: "/panel",
          errorCallbackURL: "/ingresar",
        }),
      }),
    );
    store(jar, start);
    const { url } = (await start.json()) as { url: string };
    const authorize = await fetch(url, { redirect: "manual" });
    const callback = new URL(authorize.headers.get("location") ?? "");
    callback.searchParams.set("state", "forged-state-value");
    const done = await auth.handler(
      new Request(callback, { headers: { cookie: cookieHeader(jar) } }),
    );
    store(jar, done);
    assert.match(done.headers.get("location") ?? "", /error=/);
    assert.equal(await session(jar), null);
  });

  it("explicit linking is accepted from an owner and refused for a viewer", async () => {
    const ownerLogin = await signIn({ email: "owner@example.test", sub: "owner-3" });
    const ownerSession = await session(ownerLogin.jar);
    const owner = {
      id: ownerSession?.user.id ?? "",
      email: "owner@example.test",
      role: "owner" as const,
    };
    const invite = await inviteMember(deps, owner, "linker@example.test", "viewer");
    if (!invite.ok) throw new Error("invite failed");
    const viewer = await signIn(
      { email: "linker@example.test", sub: "l-1" },
      new Map([[INVITATION_COOKIE, invite.token]]),
    );
    assert.match(viewer.location, /\/panel$/);
    const link = (jar: Jar) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/link-social`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: ORIGIN,
            cookie: cookieHeader(jar),
          },
          body: JSON.stringify({ provider: "test-idp", callbackURL: "/panel/cuenta" }),
        }),
      );
    assert.equal((await link(viewer.jar)).status, 403);
    assert.equal((await link(ownerLogin.jar)).status, 200);
  });

  it("records access changes by id only (no e-mails or tokens in the audit)", async () => {
    const { rows } = await pool.query<{ action: string; subject_id: string }>(
      "SELECT action, subject_id FROM backoffice_access_audit ORDER BY id",
    );
    assert.ok(rows.some((row) => row.action === "invitation_created"));
    assert.ok(rows.some((row) => row.action === "invitation_accepted"));
    assert.ok(rows.some((row) => row.action === "member_removed"));
    assert.ok(rows.every((row) => !row.subject_id.includes("@")));
  });

  it("limits sign-in attempts with database-backed counters", async () => {
    const limited = createAuth(
      {
        origin: ORIGIN,
        secret: "integration-secret-0000000000000000000000",
        secureCookies: false,
        sessionHours: 8,
        google: null,
        github: null,
        testIssuer: IDP,
      },
      pool,
      deps,
    );
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await limited.handler(
        new Request(`${ORIGIN}/api/auth/sign-in/social`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: ORIGIN,
            "x-forwarded-for": "203.0.113.7",
          },
          body: JSON.stringify({ provider: "test-idp", callbackURL: "/panel" }),
        }),
      );
      statuses.push(response.status);
    }
    assert.ok(statuses.includes(429), `statuses: ${statuses.join(",")}`);
    const { rows } = await pool.query<{ n: string }>("SELECT count(*) AS n FROM auth_rate_limit");
    assert.ok(Number(rows[0]?.n) > 0, "counters are persisted in PostgreSQL");
  });

  it("offers no e-mail/password sign-up or sign-in", async () => {
    for (const endpoint of ["sign-up/email", "sign-in/email"]) {
      const response = await auth.handler(
        new Request(`${ORIGIN}/api/auth/${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN },
          body: JSON.stringify({ email: "x@example.test", password: "password1234", name: "x" }),
        }),
      );
      assert.ok(response.status >= 400, `${endpoint} answered ${response.status}`);
    }
    assert.equal(await userCount("x@example.test"), 0);
  });
});
