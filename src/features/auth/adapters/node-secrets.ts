import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Secrets } from "../application/ports.ts";

export const nodeSecrets: Secrets = {
  token: () => randomBytes(32).toString("base64url"),
  digest: (token) => createHash("sha256").update(token, "utf8").digest("hex"),
  id: () => randomUUID(),
};
