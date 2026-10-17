import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { it } from "node:test";
import pg from "pg";
import { trackPoolClosure } from "../../scripts/close-pool.ts";

class TestPool extends EventEmitter {
  ended = false;
  async end(): Promise<void> {
    this.ended = true;
    // Mirrors pg-pool: end can resolve before sockets emit remove.
  }
}

it("waits for every socket removal before allowing a disposable database drop", async () => {
  const pool = new TestPool();
  const closePool = trackPoolClosure(pool);
  const first = {};
  const second = {};
  pool.emit("connect", first);
  pool.emit("connect", second);
  let dropped = false;
  const cleanup = closePool().then(() => {
    dropped = true;
  });
  await Promise.resolve();
  assert.equal(pool.ended, true);
  assert.equal(dropped, false);
  pool.emit("remove", first);
  await Promise.resolve();
  assert.equal(dropped, false);
  pool.emit("remove", second);
  await cleanup;
  assert.equal(dropped, true);
  assert.equal(pool.listenerCount("remove"), 0);
});

it("closes an empty pool and releases the listener when end fails", async () => {
  const pool = new TestPool();
  const closePool = trackPoolClosure(pool);
  await closePool();
  assert.equal(pool.listenerCount("remove"), 0);
  const failure = new Error("test close failure");
  pool.end = async () => {
    throw failure;
  };
  await assert.rejects(trackPoolClosure(pool)(), failure);
  assert.equal(pool.listenerCount("remove"), 0);
});

it("waits for a removal already started by the pinned pg-pool before end", async () => {
  const pool = new pg.Pool(); // No connect/query: the driver lifecycle is exercised without IO.
  const closePool = trackPoolClosure(pool);
  let socketClosed: (() => void) | undefined;
  const client = {
    end(callback: () => void) {
      socketClosed = callback;
    },
  };
  // Deliberately reproduce the pinned driver's internal ordering, which caused the real
  // drift-check failure: removal drops totalCount before end(callback) closes the socket.
  const driver = pool as unknown as {
    _clients: unknown[];
    _remove(client: unknown): void;
  };
  driver._clients.push(client);
  pool.emit("connect", client);
  driver._remove(client);
  assert.equal(pool.totalCount, 0);
  let dropped = false;
  const cleanup = closePool().then(() => {
    dropped = true;
  });
  await Promise.resolve();
  assert.equal(dropped, false);
  assert.ok(socketClosed);
  socketClosed();
  await cleanup;
  assert.equal(dropped, true);
  assert.equal(pool.listenerCount("connect"), 0);
  assert.equal(pool.listenerCount("remove"), 0);
});
