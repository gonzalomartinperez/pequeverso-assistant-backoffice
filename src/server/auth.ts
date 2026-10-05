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
    statement_timeout: 10_000,
  });
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
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return resolveActor(accessDeps(), { userId: session.user.id, email: session.user.email });
}

/** Guard for pages and server actions. Redirects instead of rendering anything private. */
export async function requireActor(action: Action): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/ingresar");
  if (!can(actor.role, action)) redirect("/panel");
  return actor;
}

export function enabledProviders(): { id: string; label: string }[] {
  const settings = config();
  const list: { id: string; label: string }[] = [];
  if (settings.google) list.push({ id: "google", label: "Google" });
  if (settings.github) list.push({ id: "github", label: "GitHub" });
  if (settings.testIssuer) list.push({ id: "test-idp", label: "Proveedor de prueba" });
  return list;
}
