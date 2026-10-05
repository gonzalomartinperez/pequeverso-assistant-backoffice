import "server-only";
import { httpOpsSource } from "../features/operations/adapters/ops-http.ts";
import type { OpsReading } from "../features/operations/application/ports.ts";
import { config } from "./config.ts";

/** Fresh operational reading for the current request (never cached or shared between users). */
export function readOperations(): Promise<OpsReading> {
  return httpOpsSource(config().ops).read();
}
