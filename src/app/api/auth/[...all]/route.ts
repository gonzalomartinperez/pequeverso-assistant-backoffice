import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// Better Auth endpoints (OAuth redirects and callbacks, session, sign-out, explicit linking).
export async function GET(request: Request) {
  return toNextJsHandler(auth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(auth()).POST(request);
}
