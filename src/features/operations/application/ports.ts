import type { OpsSummary } from "../domain/summary.ts";

export type OpsReading =
  | { status: "ok"; summary: OpsSummary; fetchedAt: Date }
  | {
      status: "unavailable";
      reason: "not_configured" | "unreachable" | "rejected" | "invalid";
      fetchedAt: Date;
    };

/** Reads the API's private operational summary (server to server). */
export interface OpsSource {
  read(): Promise<OpsReading>;
}
