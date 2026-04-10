/**
 * @module @kb-labs/core/config/__tests__/cache.spec.ts
 * Tests for filesystem cache functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fsCache, clearCaches } from "../cache/fs-cache";
import { readConfigFile } from "../api/read-config";

describe("Filesystem Cache", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-cache-test-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
    clearCaches();
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
    clearCaches();
  });

  describe("Cache Operations", () => {
    it("should cache file reads", async () => {
      const configPath = path.join(testDir, "test-config.json");
      const configData = { test: "value" };

      await fsp.writeFile(configPath, JSON.stringify(configData, null, 2));

      // First read - should not be cached
      const result1 = await readConfigFile(configPath);
      expect(result1.data).toEqual(configData);

      // Second read - should be cached
      const result2 = await readConfigFile(configPath);
      expect(result2.data).toEqual(configData);
    });

    it("should invalidate cache on file change", async () => {
      const configPath = path.join(testDir, "test-config.json");
      const configData1 = { test: "value1" };
      const configData2 = { test: "value2" };

      await fsp.writeFile(configPath, JSON.stringify(configData1, null, 2));

      // First read
      const result1 = await readConfigFile(configPath);
      expect(result1.data).toEqual(configData1);

      // Small delay to ensure mtime changes
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      // Modify file
      await fsp.writeFile(configPath, JSON.stringify(configData2, null, 2));

      // Second read - should get new data
      const result2 = await readConfigFile(configPath);
      expect(result2.data).toEqual(configData2);
    });

    it("should clear caches", async () => {
      const configPath = path.join(testDir, "test-config.json");
      const configData = { test: "value" };

      await fsp.writeFile(configPath, JSON.stringify(configData, null, 2));

      // Read to populate cache
      await readConfigFile(configPath);

      // Clear cache
      clearCaches();

      // Verify cache is cleared by checking stats
      const stats = fsCache.getStats();
      expect(stats.size).toBe(0);
    });

    it("should handle YAML files", async () => {
      const configPath = path.join(testDir, "test-config.yaml");
      const configData = { test: "value", nested: { key: "value" } };

      await fsp.writeFile(configPath, `test: value\nnested:\n  key: value`);

      const result = await readConfigFile(configPath);
      expect(result.format).toBe("yaml");
      expect(result.data).toEqual(configData);
    });
  });

  describe("Cache Statistics", () => {
    it("should track cache size", async () => {
      const configPath1 = path.join(testDir, "config1.json");
      const configPath2 = path.join(testDir, "config2.json");

      await fsp.writeFile(configPath1, JSON.stringify({ test1: "value1" }));
      await fsp.writeFile(configPath2, JSON.stringify({ test2: "value2" }));

      // Read both files
      await readConfigFile(configPath1);
      await readConfigFile(configPath2);

      const stats = fsCache.getStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});
