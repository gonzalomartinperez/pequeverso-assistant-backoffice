import "server-only";
import { parseAllowedOrigins } from "../../features/embed/protocol";

/**
 * Runtime configuration read on the server per request (not baked into the client bundle), so
 * one image serves every environment. Defaults are the verified production values:
 * - https://pequeverso.com is the storefront origin in the storefront's own configuration
 *   (its public site URL setting) and in the API catalog (`site.origin`). No www variant is assumed.
 * - The link hosts are those the API allows in its catalog (`catalog_allowed_hosts`).
 * - Embedding is denied unless EMBED_ALLOWED_ORIGINS lists exact origins.
 */
export type ClientConfig = {
  storefrontOrigin: string;
  linkHosts: string[];
  embedOrigins: string[];
  supportUrl: string;
};

function origin(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  const url = new URL(raw);
  const local =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.origin !== raw || (url.protocol !== "https:" && !local))
    throw new Error("STOREFRONT_ORIGIN must be a bare https origin");
  return url.origin;
}

function hosts(value: string | undefined): string[] {
  const list = (value ?? "consumer.hotmart.com,refund.hotmart.com")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  for (const host of list)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host))
      throw new Error(`Invalid ASSISTANT_LINK_HOSTS entry: ${host}`);
  return list;
}

export function readClientConfig(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const storefrontOrigin = origin(env.STOREFRONT_ORIGIN, "https://pequeverso.com");
  return {
    storefrontOrigin,
    linkHosts: hosts(env.ASSISTANT_LINK_HOSTS),
    embedOrigins: parseAllowedOrigins(env.EMBED_ALLOWED_ORIGINS),
    supportUrl: `${storefrontOrigin}/soporte/`,
  };
}
