import "server-only";
import { type BackofficeConfig, parseConfig } from "./parse-config.ts";

export type { BackofficeConfig };

let cached: BackofficeConfig | null = null;

/** Parsed once per process on first use, so `next build` needs no secrets. */
export function config(): BackofficeConfig {
  cached ??= parseConfig(process.env);
  return cached;
}
