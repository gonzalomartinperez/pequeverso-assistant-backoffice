import type { OpsSummary } from "../domain/summary.ts";
import type { OpsTelemetry } from "../domain/telemetry.ts";

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

export type TelemetryReading =
  | { status: "ok"; telemetry: OpsTelemetry; fetchedAt: Date }
  | {
      status: "unavailable";
      reason: "disabled" | "not_configured" | "rejected" | "invalid_or_unreachable";
      fetchedAt: Date;
    };
