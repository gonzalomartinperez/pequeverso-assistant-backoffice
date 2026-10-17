// Attach immediately after constructing an owned pool, before any connection is acquired.
// pg-pool removes clients from totalCount before their sockets close, including idle eviction.
type OwnedPool = {
  on(event: "connect" | "remove", listener: (client: unknown) => void): unknown;
  off(event: "connect" | "remove", listener: (client: unknown) => void): unknown;
  end(): Promise<void>;
};

export function trackPoolClosure(pool: OwnedPool): () => Promise<void> {
  const clients = new Set<unknown>();
  let drained: (() => void) | undefined;
  const connected = (client: unknown) => clients.add(client);
  const removed = (client: unknown) => {
    clients.delete(client);
    if (clients.size === 0) drained?.();
  };
  pool.on("connect", connected);
  pool.on("remove", removed);
  return async () => {
    try {
      await pool.end();
      if (clients.size > 0)
        await new Promise<void>((resolve) => {
          drained = resolve;
        });
    } finally {
      pool.off("connect", connected);
      pool.off("remove", removed);
    }
  };
}
