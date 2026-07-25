/**
 * @module @kb-labs/adapters-fs/__tests__/secure-storage
 * Unit tests for SecureStorageAdapter
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createAdapter } from "./index.js";
import {
  SecureStorageAdapter,
  StoragePermissionError,
} from "./secure-storage.js";

describe("SecureStorageAdapter", () => {
  let tmpDir: string;
  let baseStorage: ReturnType<typeof createAdapter>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kb-test-secure-"));
    baseStorage = createAdapter({ baseDir: tmpDir });

    // Create some test files
    await baseStorage.write("public/file.txt", Buffer.from("public"));
    await baseStorage.write("private/secret.txt", Buffer.from("secret"));
    await baseStorage.write("docs/readme.md", Buffer.from("readme"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("Operation Permissions", () => {
    it("should allow read when permission granted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, { read: true });

      const content = await secure.read("public/file.txt");

      expect(content?.toString()).toBe("public");
    });

    it("should deny read when permission not granted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, { read: false });

      await expect(secure.read("public/file.txt")).rejects.toThrow(
        StoragePermissionError,
      );
      await expect(secure.read("public/file.txt")).rejects.toThrow(
        "read operations are disabled",
      );
    });

    it("should allow write when permission granted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, { write: true });

      await secure.write("new/file.txt", Buffer.from("new content"));

      const content = await baseStorage.read("new/file.txt");
      expect(content?.toString()).toBe("new content");
    });

    it("should deny write when permission not granted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, { write: false });

      await expect(
        secure.write("new/file.txt", Buffer.from("test")),
      ).rejects.toThrow(StoragePermissionError);
    });

    it("should allow delete when permission granted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, { delete: true });

      await secure.delete("public/file.txt");

      expect(await baseStorage.exists("public/file.txt")).toBe(false);
    });

    it("should deny delete when permission explicitly set to false", async () => {
      const secure = new SecureStorageAdapter(baseStorage, { delete: false });

      await expect(secure.delete("public/file.txt")).rejects.toThrow(
        StoragePermissionError,
      );
      await expect(secure.delete("public/file.txt")).rejects.toThrow(
        "delete operations are disabled",
      );
    });
  });

  describe("Path Allowlist", () => {
    it("should allow access to allowlisted paths", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/", "docs/"],
        read: true,
      });

      const content1 = await secure.read("public/file.txt");
      const content2 = await secure.read("docs/readme.md");

      expect(content1?.toString()).toBe("public");
      expect(content2?.toString()).toBe("readme");
    });

    it("should deny access to non-allowlisted paths", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        StoragePermissionError,
      );
      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        "not in allowlist",
      );
    });

    it("should work with empty allowlist (allow all)", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: [],
        read: true,
      });

      const content = await secure.read("private/secret.txt");

      expect(content?.toString()).toBe("secret");
    });

    it("should work with undefined allowlist (allow all)", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        read: true,
      });

      const content = await secure.read("private/secret.txt");

      expect(content?.toString()).toBe("secret");
    });
  });

  describe("Path Denylist", () => {
    it("should deny access to denylisted paths", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        denylist: ["private/"],
        read: true,
      });

      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        StoragePermissionError,
      );
      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        "path matches denylist",
      );
    });

    it("should allow access to non-denylisted paths", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        denylist: ["private/"],
        read: true,
      });

      const content = await secure.read("public/file.txt");

      expect(content?.toString()).toBe("public");
    });

    it("should give denylist precedence over allowlist", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["private/"],
        denylist: ["private/"],
        read: true,
      });

      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        StoragePermissionError,
      );
      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        "path matches denylist",
      );
    });
  });

  describe("List Operations with Permissions", () => {
    it("should list files respecting permissions", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      const files = await secure.list("public/");

      expect(files).toContain("public/file.txt");
    });

    it("should deny list for non-allowlisted paths", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      await expect(secure.list("private/")).rejects.toThrow(
        StoragePermissionError,
      );
    });
  });

  describe("Exists with Permissions", () => {
    it("should check existence when allowed", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      expect(await secure.exists("public/file.txt")).toBe(true);
    });

    it("should return false for denied paths (security by obscurity)", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      // exists() returns false for denied paths instead of throwing error
      // This prevents information leakage about file existence
      expect(await secure.exists("private/secret.txt")).toBe(false);
    });
  });

  describe("Extended Methods with Permissions", () => {
    it("should allow stat when permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      const metadata = await secure.stat?.("public/file.txt");

      expect(metadata).not.toBeNull();
      expect(metadata?.path).toBe("public/file.txt");
    });

    it("should deny stat when not permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      await expect(secure.stat?.("private/secret.txt")).rejects.toThrow(
        StoragePermissionError,
      );
    });

    it("should allow copy when both paths permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
        write: true,
      });

      await secure.copy?.("public/file.txt", "public/copy.txt");

      expect(await baseStorage.exists("public/copy.txt")).toBe(true);
    });

    it("should deny copy when source not permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
        write: true,
      });

      await expect(
        secure.copy?.("private/secret.txt", "public/copy.txt"),
      ).rejects.toThrow(StoragePermissionError);
    });

    it("should deny copy when destination not permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
        write: true,
      });

      await expect(
        secure.copy?.("public/file.txt", "private/copy.txt"),
      ).rejects.toThrow(StoragePermissionError);
    });

    it("should allow move when both paths permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
        write: true,
      });

      await secure.move?.("public/file.txt", "public/moved.txt");

      expect(await baseStorage.exists("public/file.txt")).toBe(false);
      expect(await baseStorage.exists("public/moved.txt")).toBe(true);
    });

    it("should allow listWithMetadata when permitted", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/"],
        read: true,
      });

      const files = await secure.listWithMetadata?.("public/");

      expect(files).toBeDefined();
      expect(files!.length).toBeGreaterThan(0);
      expect(files![0]!.path).toBeDefined();
    });
  });

  describe("Complex Permission Scenarios", () => {
    it("should handle multiple allowlist patterns", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/", "docs/"],
        read: true,
      });

      const content1 = await secure.read("public/file.txt");
      const content2 = await secure.read("docs/readme.md");

      expect(content1).not.toBeNull();
      expect(content2).not.toBeNull();
    });

    it("should handle multiple denylist patterns", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        denylist: ["private/", "secrets/"],
        read: true,
      });

      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        StoragePermissionError,
      );
    });

    it("should combine allowlist and denylist correctly", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        allowlist: ["public/", "private/"],
        denylist: ["private/"],
        read: true,
      });

      // public/ is in allowlist and not in denylist - allowed
      const content = await secure.read("public/file.txt");
      expect(content).not.toBeNull();

      // private/ is in both - denylist takes precedence - denied
      await expect(secure.read("private/secret.txt")).rejects.toThrow(
        StoragePermissionError,
      );
    });

    it("should handle read-only permissions", async () => {
      const secure = new SecureStorageAdapter(baseStorage, {
        read: true,
        write: false,
        delete: false,
      });

      // Can read
      const content = await secure.read("public/file.txt");
      expect(content).not.toBeNull();

      // Cannot write
      await expect(
        secure.write("new.txt", Buffer.from("test")),
      ).rejects.toThrow(StoragePermissionError);

      // Cannot delete
      await expect(secure.delete("public/file.txt")).rejects.toThrow(
        StoragePermissionError,
      );
    });
  });
});
