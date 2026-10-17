import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { it } from "node:test";
import { closePool } from "../../scripts/close-pool.ts";

class TestPool extends EventEmitter {
  totalCount = 2;
  ended = false;
  async end(): Promise<void> {
    this.totalCount = 0;
    this.ended = true;
    // Mirrors pg-pool: end can resolve before sockets emit remove.
  }
}

it("waits for every socket removal before allowing a disposable database drop", async () => {
  const pool = new TestPool();
  let dropped = false;
  const cleanup = closePool(pool).then(() => {
    dropped = true;
  });
  await Promise.resolve();
  assert.equal(pool.ended, true);
  assert.equal(dropped, false);
  pool.emit("remove");
  await Promise.resolve();
  assert.equal(dropped, false);
  pool.emit("remove");
  await cleanup;
  assert.equal(dropped, true);
  assert.equal(pool.listenerCount("remove"), 0);
});

it("closes an empty pool and releases the listener when end fails", async () => {
  const pool = new TestPool();
  pool.totalCount = 0;
  await closePool(pool);
  assert.equal(pool.listenerCount("remove"), 0);
  const failure = new Error("test close failure");
  pool.end = async () => {
    throw failure;
  };
  await assert.rejects(closePool(pool), failure);
  assert.equal(pool.listenerCount("remove"), 0);
});
