import { connection } from "next/server";
import type { Page } from "@/features/assistant/domain/models";
import { EmbeddedShell } from "@/features/embed/embedded-shell";
import { readClientConfig } from "@/shared/config/runtime";

type Search = Promise<Record<string, string | string[] | undefined>>;

const PAGES: readonly Page[] = ["home", "product", "support"];

/** Only non-sensitive presentation hints travel in the iframe URL; nothing else is read from it. */
export default async function EmbedPage({ searchParams }: { searchParams: Search }) {
  await connection();
  const query = await searchParams;
  const config = readClientConfig();
  const page = PAGES.find((value) => value === query.page) ?? null;
  return (
    <EmbeddedShell
      policy={{ storefrontOrigin: config.storefrontOrigin, linkHosts: config.linkHosts }}
      supportUrl={config.supportUrl}
      allowedOrigins={config.embedOrigins}
      initialTheme={query.theme === "dark" ? "dark" : "light"}
      initialPage={page}
    />
  );
}
