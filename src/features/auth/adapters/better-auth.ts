import {
  type BetterAuthOptions,
  type BetterAuthPlugin,
  betterAuth,
  type DBAdapter,
  getCurrentAdapter,
} from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { Pool } from "pg";
import { type AccessDeps, admitSignUp } from "../application/access.ts";
import type { InvitationConsumer } from "../application/ports.ts";
import { isRole, type Role } from "../domain/access.ts";

/**
 * Better Auth configuration. Security-relevant choices (docs/adr/005-backoffice-auth-better-auth.md):
 * - Only OAuth (Google, GitHub); no e-mail/password, no magic links, no public sign-up.
 * - Account creation is gated by `admitSignUp` (owner e-mail or a presented invitation) in the
 *   `user.create.before` hook: a denied identity never gets a user row or a session.
 * - Implicit account linking is off; explicit linking only to the same verified e-mail.
 * - Sessions live in PostgreSQL and are read from it on every request (no cookie cache), so
 *   deleting an account or its sessions revokes access immediately.
 * - Origin checks (CSRF) stay on; trusted origins are exactly the backoffice origin.
 * - Explicit linking (`/link-social`, `/oauth2/link`) is accepted only from an authenticated owner.
 * - The invitation is consumed through the adapter of Better Auth's own sign-up transaction, so a
 *   rolled-back sign-up never spends it and admission needs no second pool connection.
 * - Client IPs for rate limiting come from X-Forwarded-For only through `trustedProxies`.
 * - Rate limits live in the database (they survive restarts); Better Auth's own logger is off
 *   (it can echo provider details); the app logs its own redacted events.
 */
export const INVITATION_COOKIE = "pv_bo_invitation";
export const SECURE_INVITATION_COOKIE = `__Host-${INVITATION_COOKIE}`;

export type AuthSettings = {
  origin: string;
  secret: string;
  secureCookies: boolean;
  sessionHours: number;
  google: { clientId: string; clientSecret: string } | null;
  github: { clientId: string; clientSecret: string } | null;
  testIssuer: string | null;
  /** Better Auth's built-in limiter (per client IP). Disabled only by tests without client IPs. */
  rateLimit?: boolean;
  /** Exact reverse-proxy addresses/CIDRs allowed to supply X-Forwarded-For. */
  trustedProxies?: string[];
};

/**
 * Registers the backoffice tables as Better Auth models (schema already created by migrations/),
 * so hooks can write them through the transaction-bound adapter.
 */
const accessModels = {
  id: "pequeverso-backoffice-access",
  schema: {
    backofficeInvitation: {
      modelName: "backoffice_invitation",
      fields: {
        email: { type: "string", required: true },
        role: { type: "string", required: true },
        tokenDigest: { type: "string", required: true, fieldName: "token_digest" },
        createdBy: { type: "string", required: false, fieldName: "created_by" },
        createdAt: { type: "date", required: true, fieldName: "created_at" },
        expiresAt: { type: "date", required: true, fieldName: "expires_at" },
        acceptedAt: { type: "date", required: false, fieldName: "accepted_at" },
        revokedAt: { type: "date", required: false, fieldName: "revoked_at" },
      },
    },
    backofficeAccessAudit: {
      modelName: "backoffice_access_audit",
      fields: {
        action: { type: "string", required: true },
        actorId: { type: "string", required: false, fieldName: "actor_id" },
        subjectId: { type: "string", required: true, fieldName: "subject_id" },
        at: { type: "date", required: true },
      },
    },
  },
} satisfies BetterAuthPlugin;

/** Invitation consumption on the adapter of the current Better Auth transaction. */
export function transactionalInvitations(
  adapter: Pick<DBAdapter, "updateMany" | "findOne" | "create">,
): InvitationConsumer {
  return {
    async consumeInvitation(digest, email, now) {
      // One guarded UPDATE: concurrent sign-ups with the same token serialize on the row lock and
      // only one sees a matching, still-pending invitation.
      const accepted = await adapter.updateMany({
        model: "backofficeInvitation",
        where: [
          { field: "tokenDigest", value: digest },
          { field: "email", value: email },
          { field: "acceptedAt", value: null },
          { field: "revokedAt", value: null },
          { field: "expiresAt", operator: "gt", value: now },
        ],
        update: { acceptedAt: now },
      });
      if (accepted !== 1) return null;
      const row = await adapter.findOne<{ id: string; role: string }>({
        model: "backofficeInvitation",
        where: [{ field: "tokenDigest", value: digest }],
      });
      if (!row || !isRole(row.role)) return null;
      await adapter.create({
        model: "backofficeAccessAudit",
        data: { action: "invitation_accepted", actorId: null, subjectId: row.id, at: now },
      });
      return { id: row.id, role: row.role as Role };
    },
  };
}

// `/oauth2/link` does not exist in 1.7.7 (generic OAuth links through `/link-social`); it stays
// listed so a future plugin version cannot reopen linking for viewers.
const OWNER_ONLY_PATHS = new Set(["/link-social", "/oauth2/link", "/unlink-account"]);

export function authOptions(settings: AuthSettings, pool: Pool, access: AccessDeps) {
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (settings.google)
    socialProviders.google = {
      ...settings.google,
      prompt: "select_account",
      disableImplicitSignUp: false,
    };
  if (settings.github) socialProviders.github = { ...settings.github };

  const plugins: BetterAuthPlugin[] = [accessModels];
  if (settings.testIssuer)
    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: "test-idp",
            clientId: "backoffice-test",
            clientSecret: "backoffice-test-secret",
            authorizationUrl: `${settings.testIssuer}/authorize`,
            tokenUrl: `${settings.testIssuer}/token`,
            userInfoUrl: `${settings.testIssuer}/userinfo`,
            scopes: ["openid", "email"],
            pkce: true,
          },
        ],
      }),
    );

  return {
    appName: "Backoffice del asistente Pequeverso",
    baseURL: settings.origin,
    basePath: "/api/auth",
    secret: settings.secret,
    database: pool,
    trustedOrigins: [settings.origin],
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    socialProviders,
    plugins,
    user: {
      modelName: "auth_user",
      additionalFields: {
        role: { type: "string", required: true, input: false, defaultValue: "viewer" },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: "auth_session",
      expiresIn: settings.sessionHours * 3600,
      updateAge: 3600,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "auth_account",
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        trustedProviders: [],
      },
    },
    verification: { modelName: "auth_verification" },
    rateLimit: {
      enabled: settings.rateLimit !== false,
      window: 60,
      max: 30,
      storage: "database",
      modelName: "auth_rate_limit",
    },
    logger: { disabled: true },
    advanced: {
      useSecureCookies: settings.secureCookies,
      cookiePrefix: "pv_bo",
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      crossSubDomainCookies: { enabled: false },
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: settings.trustedProxies ?? [],
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (!OWNER_ONLY_PATHS.has(context.path)) return;
        const session = await getSessionFromCtx(context);
        const role = session?.user.emailVerified
          ? await access.store.memberRole(session.user.id)
          : null;
        if (role !== "owner") throw new APIError("FORBIDDEN", { message: "forbidden" });
      }),
    },
    disabledPaths: [
      "/update-user",
      "/delete-user",
      "/change-email",
      "/list-accounts",
      "/get-access-token",
      "/refresh-token",
      "/account-info",
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const token =
              context?.getCookie(SECURE_INVITATION_COOKIE) ??
              context?.getCookie(INVITATION_COOKIE) ??
              null;
            if (!context) return false; // only real sign-up requests can create accounts
            const adapter = await getCurrentAdapter(context.context.adapter);
            const admission = await admitSignUp(
              { ...access, invitations: transactionalInvitations(adapter) },
              { email: user.email, emailVerified: user.emailVerified === true },
              token,
            );
            if (!admission.allowed) {
              // Returning false makes Better Auth abort the creation and redirect to the error
              // page; the reason is logged without the e-mail address.
              console.warn(JSON.stringify({ event: "sign_up_denied", reason: admission.reason }));
              return false;
            }
            return {
              data: { ...user, email: user.email.trim().toLowerCase(), role: admission.role },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            // A session is only created for an account that still holds a role. Read on the
            // current (possibly transactional) adapter: no second pool connection.
            if (!context) return false;
            const adapter = await getCurrentAdapter(context.context.adapter);
            const user = await adapter.findOne<{ role?: unknown }>({
              model: "user",
              where: [{ field: "id", value: session.userId }],
            });
            return isRole(user?.role) ? undefined : false;
          },
        },
      },
    },
    onAPIError: { errorURL: "/ingresar" },
  } satisfies BetterAuthOptions;
}

export function createAuth(settings: AuthSettings, pool: Pool, access: AccessDeps) {
  return betterAuth(authOptions(settings, pool, access));
}

export type Auth = ReturnType<typeof createAuth>;
