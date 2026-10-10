"use client";
import { createAuthClient } from "better-auth/client";

/** Browser client for Better Auth endpoints on this origin. Holds no tokens: cookies are HttpOnly. */
export const authClient = createAuthClient({ basePath: "/api/auth" });
