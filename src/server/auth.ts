import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Pool } from "pg";
import {
  type Auth,
  createAuth,
  INVITATION_COOKIE,
  SECURE_INVITATION_COOKIE,
} from "../features/auth/adapters/better-auth.ts";

export { INVITATION_COOKIE, SECURE_INVITATION_COOKIE };

import { nodeSecrets } from "../features/auth/adapters/node-secrets.ts";
import { PostgresAccessStore } from "../features/auth/adapters/postgres-access-store.ts";
import { type AccessDeps, type Actor, resolveActor } from "../features/auth/application/access.ts";
import { type Action, can } from "../features/auth/domain/access.ts";
import { config } from "./config.ts";

/** Composition root for authentication and access (server only). */
type Composition = { pool: Pool; access: AccessDeps; auth: Auth };
let composition: Composition | null = null;

function compose(): Composition {
  if (composition) return composition;
  const settings = config();
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  // An idle client dropped by the server (restart, failover) emits 'error' on the pool; unhandled,
  // it would crash the process. The next query reconnects; requests fail closed meanwhile.
  pool.on("error", () => console.error(JSON.stringify({ event: "database_connection_lost" })));
  const access: AccessDeps = {
    store: new PostgresAccessStore(pool),
    secrets: nodeSecrets,
    clock: { now: () => new Date() },
    ownerEmail: settings.ownerEmail,
  };
  const auth = createAuth(
    {
      origin: settings.origin,
      secret: settings.authSecret,
      secureCookies: settings.origin.startsWith("https:"),
      sessionHours: settings.sessionHours,
      google: settings.google,
      github: settings.github,
      testIssuer: settings.testIssuer,
      rateLimit: settings.rateLimit,
      trustedProxies: settings.trustedProxies,
    },
    pool,
    access,
  );
  composition = { pool, access, auth };
  return composition;
}

export function auth(): Auth {
  return compose().auth;
}

export function accessDeps(): AccessDeps {
  return compose().access;
}

export function databasePool(): Pool {
  return compose().pool;
}

/** The signed-in operator with a role read from the database on this request, or null. */
export async function currentActor(): Promise<Actor | null> {
  // Read the request first: during `next build` this marks the route dynamic before any
  // database connection is attempted.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
  if (!session) return null;
  return resolveActor(accessDeps(), {
    userId: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true,
  });
}

/**
 * Guard for pages and server actions. Redirects instead of rendering anything private; an
 * infrastructure failure (database, configuration) leads to a safe "unavailable" sign-in page
 * without raw errors.
 */
export async function requireActor(action: Action): Promise<Actor> {
  let actor: Actor | null;
  try {
    actor = await currentActor();
  } catch (error) {
    if (isRedirectOrDynamic(error)) throw error;
    console.error(JSON.stringify({ event: "access_check_failed" }));
    redirect("/ingresar?error=unavailable");
  }
  if (!actor) redirect("/ingresar");
  if (!can(actor.role, action)) redirect("/panel");
  return actor;
}

function isRedirectOrDynamic(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    /^(NEXT_REDIRECT|DYNAMIC_SERVER_USAGE|NEXT_NOT_FOUND)/.test(digest)
  );
}

/**
 * Readiness for sign-in and for `/readyz`: configuration parses, the database answers and every
 * table this release needs exists (migrations applied). Never throws, never reveals why.
 */
export async function authReady(): Promise<boolean> {
  try {
    const pool = databasePool();
    for (const table of [
      "auth_user",
      "auth_session",
      "auth_account",
      "auth_verification",
      "auth_rate_limit",
      "backoffice_invitation",
      "backoffice_access_audit",
    ])
      await pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

export function enabledProviders(): { id: string; label: string }[] {
  let settings: ReturnType<typeof config>;
  try {
    settings = config();
  } catch {
    return [];
  }
  const list: { id: string; label: string }[] = [];
  if (settings.google) list.push({ id: "google", label: "Google" });
  if (settings.github) list.push({ id: "github", label: "GitHub" });
  if (settings.testIssuer) list.push({ id: "test-idp", label: "Proveedor de prueba" });
  return list;
}
