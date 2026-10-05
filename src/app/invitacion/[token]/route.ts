import { type NextRequest, NextResponse } from "next/server";
import { inspectInvitation } from "@/features/auth/application/access";
import { accessDeps, INVITATION_COOKIE, SECURE_INVITATION_COOKIE } from "@/server/auth";
import { config } from "@/server/config";

/**
 * Invitation landing. The token is checked (not consumed) and handed to the sign-in flow in a
 * short-lived HttpOnly cookie, then the browser leaves this URL so the token does not linger in
 * the address bar. The invitation is consumed only when an account with the same verified e-mail
 * is created.
 */
export async function GET(_: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = config().origin;
  const view = await inspectInvitation(accessDeps(), token);
  const target = new URL(
    view.state === "pending" ? "/ingresar?invitacion=1" : "/ingresar?error=invitation_invalid",
    origin,
  );
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (view.state === "pending") {
    const secure = origin.startsWith("https:");
    response.cookies.set(secure ? SECURE_INVITATION_COOKIE : INVITATION_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
  }
  return response;
}
