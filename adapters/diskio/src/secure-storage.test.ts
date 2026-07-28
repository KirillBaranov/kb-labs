import { describe, expect, it } from "vitest";
import { createSecureStorage, StoragePermissionError } from "./secure-storage.js";
import type { IStorage } from "@kb-labs/sdk/adapters";

function fakeStorage(): IStorage {
  const values = new Map<string, Buffer>();
  values.set("public/a.txt", Buffer.from("a"));
  values.set("private/b.txt", Buffer.from("b"));
  return {
    async read(path) { return values.get(path) ?? null; },
    async write(path, data) { values.set(path, data); },
    async delete(path) { values.delete(path); },
    async list() { return [...values.keys()]; },
    async exists(path) { return values.has(path); },
  };
}

describe("secure storage policy", () => {
  it("gives deny rules priority and hides denied existence", async () => {
    const secure = createSecureStorage(fakeStorage(), {
      allowlist: ["public/", "private/"],
      denylist: ["private/"],
      read: true,
    });

    await expect(secure.read("private/b.txt")).rejects.toBeInstanceOf(StoragePermissionError);
    expect(await secure.exists("private/b.txt")).toBe(false);
    expect(await secure.list("public/")).toEqual(["public/a.txt"]);
  });

  it("enforces operation switches", async () => {
    const secure = createSecureStorage(fakeStorage(), { read: false, write: false, delete: false });
    await expect(secure.read("public/a.txt")).rejects.toThrow("read operations are disabled");
    await expect(secure.write("public/c.txt", Buffer.from("c"))).rejects.toThrow(StoragePermissionError);
    await expect(secure.delete("public/a.txt")).rejects.toThrow(StoragePermissionError);
  });
});
