import { describe, expect, it } from "vitest";
import { createAdapter } from "./index.js";

describe("StateBrokerCacheAdapter", () => {
  it("implements the ICache key-value and atomic operations", async () => {
    const cache = createAdapter();

    await cache.set("commit:plan", { id: "plan-1" });
    await expect(cache.get<{ id: string }>("commit:plan")).resolves.toEqual({
      id: "plan-1",
    });
    await expect(
      cache.setIfNotExists("commit:plan", { id: "plan-2" }),
    ).resolves.toBe(false);
    await expect(
      cache.setIfNotExists("commit:other", { id: "plan-3" }),
    ).resolves.toBe(true);
    await cache.delete("commit:other");
    await expect(cache.get("commit:other")).resolves.toBeNull();
  });

  it("supports sorted-set operations required by cache consumers", async () => {
    const cache = createAdapter();

    await cache.zadd("queue", 20, "second");
    await cache.zadd("queue", 10, "first");
    await expect(cache.zrangebyscore("queue", 0, 15)).resolves.toEqual([
      "first",
    ]);
    await cache.zrem("queue", "first");
    await expect(cache.zrangebyscore("queue", 0, 100)).resolves.toEqual([
      "second",
    ]);
  });
});
