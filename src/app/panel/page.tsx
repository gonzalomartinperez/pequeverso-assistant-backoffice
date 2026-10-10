import { Dashboard } from "@/features/operations/presentation/dashboard";
import { requireActor } from "@/server/auth";
import { readOperations } from "@/server/operations";

/** Read per request on the server; the browser never sees the ops credential or the API URL. */
export default async function OperationsPage() {
  await requireActor("read_operations");
  return <Dashboard reading={await readOperations()} />;
}
