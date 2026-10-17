// pg-pool can resolve end() after removing clients from its list but before their sockets close.
// A disposable database must not be dropped until every owned client emits remove.
type OwnedPool = {
  readonly totalCount: number;
  on(event: "remove", listener: () => void): unknown;
  off(event: "remove", listener: () => void): unknown;
  end(): Promise<void>;
};

export async function closePool(pool: OwnedPool): Promise<void> {
  let remaining = pool.totalCount;
  let removed: () => void = () => {};
  const disconnected = new Promise<void>((resolve) => {
    removed = () => {
      remaining--;
      if (remaining === 0) resolve();
    };
    if (remaining === 0) resolve();
    pool.on("remove", removed);
  });
  try {
    await pool.end();
    await disconnected;
  } finally {
    pool.off("remove", removed);
  }
}
