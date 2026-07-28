import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAdapter } from "./index.js";

describe("disk storage", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "disk-storage-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips nested binary data and reports metadata", async () => {
    const store = createAdapter({ baseDir: root });
    const payload = Buffer.from([0, 1, 2, 255]);
    await store.write("a/b/blob.bin", payload);

    expect(await store.read("a/b/blob.bin")).toEqual(payload);
    expect(await store.list("a/")).toEqual(["a/b/blob.bin"]);
    expect((await store.stat("a/b/blob.bin"))?.size).toBe(payload.length);
    expect((await store.stat("a/b/blob.bin"))?.contentType).toBe("application/octet-stream");
  });

  it("treats missing reads and deletes as harmless", async () => {
    const store = createAdapter({ baseDir: root });
    expect(await store.read("missing.txt")).toBeNull();
    await expect(store.delete("missing.txt")).resolves.toBeUndefined();
    expect(await store.exists("missing.txt")).toBe(false);
  });

  it("rejects paths that resolve outside the configured root", async () => {
    const store = createAdapter({ baseDir: root });
    await expect(store.read("../outside.txt")).rejects.toThrow("Path traversal detected");
    await expect(store.write("/tmp/outside.txt", Buffer.from("x"))).rejects.toThrow("Path traversal detected");
  });

  it("copies and moves files while creating destination folders", async () => {
    const store = createAdapter({ baseDir: root });
    await store.write("source.txt", Buffer.from("value"));
    await store.copy("source.txt", "copies/copy.txt");
    await store.move("source.txt", "archive/moved.txt");

    expect(await store.read("copies/copy.txt")).toEqual(Buffer.from("value"));
    expect(await store.exists("source.txt")).toBe(false);
    expect(await store.exists("archive/moved.txt")).toBe(true);
  });
});
