import { type BetterAuthOptions, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { Pool } from "pg";
import { type AccessDeps, admitSignUp } from "../application/access.ts";

/**
 * Better Auth configuration. Security-relevant choices (docs/adr/005-backoffice-auth-better-auth.md):
 * - Only OAuth (Google, GitHub); no e-mail/password, no magic links, no public sign-up.
 * - Account creation is gated by `admitSignUp` (owner e-mail or a presented invitation) in the
 *   `user.create.before` hook: a denied identity never gets a user row or a session.
 * - Implicit account linking is off; explicit linking only to the same verified e-mail.
 * - Sessions live in PostgreSQL and are read from it on every request (no cookie cache), so
 *   deleting an account or its sessions revokes access immediately.
 * - Origin checks (CSRF) stay on; trusted origins are exactly the backoffice origin.
 * - Explicit linking (`/link-social`) is accepted only from an authenticated owner.
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
};

export function authOptions(settings: AuthSettings, pool: Pool, access: AccessDeps) {
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (settings.google)
    socialProviders.google = {
      ...settings.google,
      prompt: "select_account",
      disableImplicitSignUp: false,
    };
  if (settings.github) socialProviders.github = { ...settings.github };

  const plugins = settings.testIssuer
    ? [
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
      ]
    : [];

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
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/link-social") return;
        const session = await getSessionFromCtx(context);
        const role = session?.user.emailVerified
          ? await access.store.memberRole(session.user.id)
          : null;
        if (role !== "owner") throw new APIError("FORBIDDEN", { message: "forbidden" });
      }),
    },
    disabledPaths: ["/update-user", "/delete-user", "/change-email", "/list-accounts"],
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const token =
              context?.getCookie(SECURE_INVITATION_COOKIE) ??
              context?.getCookie(INVITATION_COOKIE) ??
              null;
            const admission = await admitSignUp(
              access,
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
          before: async (session) => {
            // A session is only created for an account that still holds a role.
            const role = await access.store.memberRole(session.userId);
            return role ? undefined : false;
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
