import { connection } from "next/server";
import { StandaloneShell } from "@/features/assistant/presentation/standalone-shell";
import { readClientConfig } from "@/shared/config/runtime";

export default async function StandalonePage() {
  await connection(); // runtime configuration is read per request, never at build time
  const config = readClientConfig();
  return (
    <StandaloneShell
      policy={{ storefrontOrigin: config.storefrontOrigin, linkHosts: config.linkHosts }}
      supportUrl={config.supportUrl}
    />
  );
}
