/**
 * @module @kb-labs/core/config/__tests__/fs-atomic.spec.ts
 * Tests for atomic file operations and workspace validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { writeFileAtomic, ensureWithinWorkspace } from "../utils/fs-atomic";
import { KbError } from "../errors/kb-error";

describe("fs-atomic", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-fs-atomic-test-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
  });

  describe("writeFileAtomic", () => {
    it("should write file atomically", async () => {
      const filePath = path.join(testDir, "test.txt");
      const content = "Hello, World!";

      await writeFileAtomic(filePath, content);

      const result = await fsp.readFile(filePath, "utf-8");
      expect(result).toBe(content);
    });

    it("should create parent directories", async () => {
      const filePath = path.join(testDir, "nested", "deep", "test.txt");
      const content = "Nested content";

      await writeFileAtomic(filePath, content);

      const result = await fsp.readFile(filePath, "utf-8");
      expect(result).toBe(content);
    });

    it("should handle Uint8Array data", async () => {
      const filePath = path.join(testDir, "binary.txt");
      const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

      await writeFileAtomic(filePath, content);

      const result = await fsp.readFile(filePath);
      expect(Array.from(result)).toEqual(Array.from(content));
    });

    it("should clean up temp file on error", async () => {
      const filePath = path.join(testDir, "test.txt");

      // Mock fs.writeFile to throw error
      const originalWriteFile = fsp.writeFile;
      vi.spyOn(fsp, "writeFile").mockRejectedValueOnce(
        new Error("Write failed"),
      );

      await expect(writeFileAtomic(filePath, "content")).rejects.toThrow(
        "Write failed",
      );

      // Check that temp file was cleaned up
      const files = await fsp.readdir(testDir);
      const tempFiles = files.filter((f) => f.startsWith("test.txt.tmp-"));
      expect(tempFiles).toHaveLength(0);

      // Restore original function
      vi.restoreAllMocks();
    });

    it("should handle cleanup errors gracefully", async () => {
      const filePath = path.join(testDir, "test.txt");

      // Mock fs.writeFile to throw error
      const originalWriteFile = fsp.writeFile;
      const originalUnlink = fsp.unlink;

      vi.spyOn(fsp, "writeFile").mockRejectedValueOnce(
        new Error("Write failed"),
      );
      vi.spyOn(fsp, "unlink").mockRejectedValueOnce(
        new Error("Cleanup failed"),
      );

      // Should not throw cleanup error
      await expect(writeFileAtomic(filePath, "content")).rejects.toThrow(
        "Write failed",
      );

      // Restore original functions
      vi.restoreAllMocks();
    });

    it("should overwrite existing file", async () => {
      const filePath = path.join(testDir, "existing.txt");
      const originalContent = "Original content";
      const newContent = "New content";

      // Create original file
      await fsp.writeFile(filePath, originalContent);

      // Overwrite atomically
      await writeFileAtomic(filePath, newContent);

      const result = await fsp.readFile(filePath, "utf-8");
      expect(result).toBe(newContent);
    });

    it("should generate unique temp file names", async () => {
      const filePath = path.join(testDir, "test.txt");
      const content = "content";

      // Mock Date.now and Math.random for predictable temp names
      const mockDateNow = vi.spyOn(Date, "now").mockReturnValue(1234567890);
      const mockMathRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);

      await writeFileAtomic(filePath, content);

      // Check that temp file name was generated correctly
      const files = await fsp.readdir(testDir);
      expect(files).toContain("test.txt");

      mockDateNow.mockRestore();
      mockMathRandom.mockRestore();
    });
  });

  describe("ensureWithinWorkspace", () => {
    it("should allow paths within workspace", () => {
      const workspaceRoot = "/workspace";
      const targetPath = "/workspace/subdir/file.txt";

      expect(() =>
        ensureWithinWorkspace(targetPath, workspaceRoot),
      ).not.toThrow();
    });

    it("should allow relative paths within workspace", () => {
      const workspaceRoot = "/workspace";
      const targetPath = path.join(workspaceRoot, "subdir", "file.txt");

      expect(() =>
        ensureWithinWorkspace(targetPath, workspaceRoot),
      ).not.toThrow();
    });

    it("should throw error for paths outside workspace", () => {
      const workspaceRoot = "/workspace";
      const targetPath = "/outside/file.txt";

      expect(() => ensureWithinWorkspace(targetPath, workspaceRoot)).toThrow(
        KbError,
      );
    });

    it("should throw error for paths that escape via ..", () => {
      const workspaceRoot = "/workspace";
      const targetPath = "/workspace/../outside/file.txt";

      expect(() => ensureWithinWorkspace(targetPath, workspaceRoot)).toThrow(
        KbError,
      );
    });

    it("should handle edge case with trailing slashes", () => {
      const workspaceRoot = "/workspace/";
      const targetPath = "/workspace/file.txt";

      expect(() =>
        ensureWithinWorkspace(targetPath, workspaceRoot),
      ).not.toThrow();
    });

    it("should handle same directory as workspace", () => {
      const workspaceRoot = "/workspace";
      const targetPath = "/workspace";

      expect(() =>
        ensureWithinWorkspace(targetPath, workspaceRoot),
      ).not.toThrow();
    });

    it("should throw error with correct error details", () => {
      const workspaceRoot = "/workspace";
      const targetPath = "/outside/file.txt";

      expect(() => ensureWithinWorkspace(targetPath, workspaceRoot)).toThrow(
        expect.objectContaining({
          code: "ERR_PATH_OUTSIDE_WORKSPACE",
          message: "Refusing to write outside workspace: /outside/file.txt",
          hint: "Check cwd or use a relative path within the workspace",
          meta: {
            targetPath: "/outside/file.txt",
            workspaceRoot: "/workspace",
          },
        }),
      );
    });

    it("should handle empty workspace root", () => {
      const workspaceRoot = "";
      const targetPath = "/some/path";

      expect(() => ensureWithinWorkspace(targetPath, workspaceRoot)).toThrow(
        KbError,
      );
    });

    it("should handle empty target path", () => {
      const workspaceRoot = "/workspace";
      const targetPath = "";

      expect(() => ensureWithinWorkspace(targetPath, workspaceRoot)).toThrow(
        KbError,
      );
    });

    it("should resolve paths correctly", () => {
      const workspaceRoot = "/workspace";
      const targetPath = path.resolve(
        workspaceRoot,
        "subdir",
        "..",
        "subdir",
        "file.txt",
      );

      expect(() =>
        ensureWithinWorkspace(targetPath, workspaceRoot),
      ).not.toThrow();
    });
  });
});
