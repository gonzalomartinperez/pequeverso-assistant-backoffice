// Minimal OAuth 2.0 identity provider for automated tests only (never used in production; the
// backoffice refuses AUTH_TEST_ISSUER when BACKOFFICE_ENVIRONMENT=production). It exercises the
// real Better Auth callback, account creation hooks and session cookies without contacting Google
// or GitHub. The next identity is chosen with POST /__identity {"email","email_verified","sub"}.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";

const port = Number(process.env.FAKE_IDP_PORT ?? 8238);
type Identity = { sub: string; email: string; email_verified: boolean; name: string };
let next: Identity = {
  sub: "u-owner",
  email: "owner@example.test",
  email_verified: true,
  name: "Owner",
};
const codes = new Map<string, { identity: Identity; challenge: string | null; redirect: string }>();
const tokens = new Map<string, Identity>();

async function body(request: IncomingMessage): Promise<string> {
  let data = "";
  for await (const chunk of request) data += chunk;
  return data;
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__identity" && request.method === "POST") {
    const parsed = JSON.parse(await body(request)) as Partial<Identity>;
    next = {
      sub: parsed.sub ?? `u-${randomBytes(4).toString("hex")}`,
      email: parsed.email ?? "someone@example.test",
      email_verified: parsed.email_verified ?? true,
      name: parsed.name ?? "Test user",
    };
    response.writeHead(204).end();
    return;
  }
  if (url.pathname === "/authorize") {
    const redirect = url.searchParams.get("redirect_uri") ?? "";
    const code = randomBytes(16).toString("hex");
    codes.set(code, {
      identity: next,
      challenge: url.searchParams.get("code_challenge"),
      redirect,
    });
    const target = new URL(redirect);
    target.searchParams.set("code", code);
    target.searchParams.set("state", url.searchParams.get("state") ?? "");
    response.writeHead(302, { location: target.toString() }).end();
    return;
  }
  if (url.pathname === "/token" && request.method === "POST") {
    const form = new URLSearchParams(await body(request));
    const grant = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const verifier = form.get("code_verifier");
    const ok =
      grant &&
      (!grant.challenge ||
        (verifier &&
          createHash("sha256").update(verifier).digest("base64url") === grant.challenge));
    if (!grant || !ok) {
      response
        .writeHead(400, { "content-type": "application/json" })
        .end('{"error":"invalid_grant"}');
      return;
    }
    const accessToken = randomBytes(16).toString("hex");
    tokens.set(accessToken, grant.identity);
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ access_token: accessToken, token_type: "Bearer", expires_in: 300 }));
    return;
  }
  if (url.pathname === "/userinfo") {
    const identity = tokens.get((request.headers.authorization ?? "").replace(/^Bearer /, ""));
    if (!identity) {
      response.writeHead(401).end();
      return;
    }
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ id: identity.sub, ...identity }));
    return;
  }
  response.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log(`fake IdP (TEST ONLY) on http://127.0.0.1:${port}`));
